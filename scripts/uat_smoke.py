from pathlib import Path
import re
import sys
from datetime import date

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:3000"
SCREENSHOT_DIR = Path("C:/Users/10345/.codex/visualizations/2026/08/11")


def wait_view(page, pattern: str) -> None:
    expect(page.get_by_text(re.compile(pattern)).first).to_be_visible(timeout=10_000)
    page.wait_for_timeout(250)


def nav(page, label: str, pattern: str) -> None:
    page.get_by_role("button", name=re.compile(label)).first.click()
    wait_view(page, pattern)
    page.wait_for_timeout(1_200)


def persisted(page, key: str) -> dict:
    raw = page.evaluate("key => localStorage.getItem(key)", key)
    return {} if not raw else page.evaluate("raw => JSON.parse(raw)", raw)


def all_tasks(page) -> list[dict]:
    state = persisted(page, "nova-task").get("state", {})
    return [task for category in state.get("categories", []) for task in category.get("tasks", [])]


def card_for(page, title: str):
    return page.locator("[class*='cursor-grab']").filter(has_text=title).last


def card_for_id(page, task_id: str):
    return page.locator("[class*='cursor-grab']").filter(has_text=task_id).last


def choose_date(page, day: int) -> None:
    page.get_by_role("button", name=re.compile("截止日期|日期")).first.click()
    popover = page.locator("[data-radix-popper-content-wrapper]").last
    popover.get_by_role("button", name=str(day), exact=True).last.click()


def create_task(page, title: str, day: int) -> None:
    page.get_by_role("button", name="新建任务", exact=True).click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_placeholder("任务标题").fill(title)
    choose_date(page, day)
    dialog.get_by_role("button", name="搜索产品...").click()
    page.locator("[data-radix-popper-content-wrapper]").last.get_by_role(
        "button", name=re.compile("WenXiBuddy AI 智能协同平台")
    ).click()
    dialog.get_by_role("button", name="创建任务").click()
    expect(page.get_by_text("任务已创建")).to_be_visible(timeout=10_000)
    expect(page.get_by_text(title, exact=True).last).to_be_attached(timeout=10_000)


def mock_chat_route(page, delete_task_id: str | None = None, initial_calls: int = 0) -> None:
    calls = {"count": initial_calls}

    def handle(route):
        calls["count"] += 1
        body = route.request.post_data_json or {}
        messages = body.get("messages", [])
        if calls["count"] == 1:
            payload = {
                "kind": "tool_call",
                "data": {
                    "name": "createTask",
                    "arguments": {
                        "title": "Mock AI UAT task",
                        "priority": "high",
                        "deadline": "2026-08-18",
                    },
                },
            }
        elif calls["count"] == 3 and delete_task_id:
            payload = {
                "kind": "tool_call",
                "data": {
                    "name": "deleteTask",
                    "arguments": {"taskId": delete_task_id},
                },
            }
        else:
            payload = {"kind": "token", "data": {"text": f"mock response ({len(messages)} messages)"}}
        route.fulfill(
            status=200,
            content_type="application/x-ndjson",
            body=(
                '{"kind":"token","data":{"text":"mock"}}\n'
                if calls["count"] > 1
                else ""
            )
            + __import__("json").dumps(payload, ensure_ascii=False)
            + "\n{\"kind\":\"done\"}\n",
        )

    page.route("**/api/chat", handle)


def run() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    checks: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("console", lambda message: errors.append(f"console: {message.text}") if message.type == "error" else None)
        page.on("pageerror", lambda error: errors.append(f"page: {error}"))

        page.goto(BASE_URL, wait_until="networkidle")
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2_000)

        # Phase 7: task -> calendar -> completion -> reverse cleanup.
        nav(page, "任务管理", "任务管理")
        uat_day = min(28, date.today().day + 3)
        task_title = "Phase 7-11 unified UAT task"
        create_task(page, task_title, uat_day)
        task_card = card_for(page, task_title)
        task_card.scroll_into_view_if_needed()
        page.wait_for_timeout(800)
        expect(task_card).to_contain_text("WenXiBuddy AI 智能协同平台")
        task_card.get_by_role("button", name="任务操作").click()
        page.get_by_role("menuitem", name=re.compile("安排到日历")).click()
        expect(page.get_by_text("已添加到日历")).to_be_visible(timeout=10_000)
        expect(task_card).to_contain_text("日程")
        checks.append("Phase 7 task product/calendar badges")

        task_state = all_tasks(page)
        created_task = next(task for task in task_state if task["title"] == task_title)
        assert created_task.get("projectId") == "p1" and created_task.get("scheduledEventId")
        event_id = created_task["scheduledEventId"]

        nav(page, "日常管理", "日常管理")
        expect(page.get_by_text(task_title, exact=True).last).to_be_visible(timeout=10_000)
        task_link = page.get_by_role("button", name=f"打开任务 {task_title}").first
        expect(task_link).to_be_visible()
        task_link.click()
        wait_view(page, "任务管理")
        expect(page.get_by_text(task_title, exact=True).last).to_be_attached()
        nav(page, "日常管理", "日常管理")
        page.get_by_role("button", name="查看关联产品").first.click()
        expect(page.get_by_text("WenXiBuddy AI 智能协同平台", exact=True).last).to_be_visible()
        page.get_by_role("button", name=re.compile("关闭|Close")).last.click()
        checks.append("Phase 7 association navigation")

        nav(page, "任务管理", "任务管理")
        task_card = card_for_id(page, created_task["id"])
        task_card.get_by_role("button", name="标记完成").click()
        page.wait_for_timeout(600)
        nav(page, "日常管理", "日常管理")
        faded_event = page.locator("[class*='opacity-50']").filter(has_text=task_title)
        assert faded_event.count() >= 1
        schedule_state = persisted(page, "nova-schedule").get("state", {})
        event = next(event for event in schedule_state.get("events", []) if event["id"] == event_id)
        assert event.get("status") == "已完成"
        page.reload(wait_until="networkidle")
        nav(page, "日常管理", "日常管理")
        persisted_schedule = persisted(page, "nova-schedule").get("state", {}).get("events", [])
        persisted_event = next(event for event in persisted_schedule if event["id"] == event_id)
        assert persisted_event.get("status") == "已完成"
        nav(page, "任务管理", "任务管理")
        task_card = card_for_id(page, created_task["id"])
        task_card.get_by_role("button", name="任务操作").click()
        page.get_by_role("menuitem", name="删除").click()
        page.get_by_role("dialog").get_by_role("button", name="删除").last.click()
        expect(page.get_by_text(task_title, exact=True)).to_have_count(0)
        schedule_state = persisted(page, "nova-schedule").get("state", {})
        event = next(event for event in schedule_state.get("events", []) if event["id"] == event_id)
        assert "taskId" not in event or not event["taskId"]
        checks.append("Phase 7 completion sync and reverse cleanup")

        # Phase 7 L5/L6 and Phase 11 deliverable path.
        nav(page, "产品管理", "产品管理")
        page.get_by_text("WenXiBuddy AI 智能协同平台", exact=True).first.click()
        expect(page.get_by_text(re.compile("阶段管控|当前阶段")).first).to_be_visible(timeout=10_000)
        page.get_by_role("button", name="进度里程碑管控").click()
        expect(page.get_by_text(re.compile("交付物|ready|就绪"), exact=False).first).to_be_visible()
        page.get_by_role("button", name=re.compile("进入.*研发中心")).first.click()
        expect(page.get_by_text("当前阶段交付物进度")).to_be_visible(timeout=10_000)
        page.get_by_role("button", name="产品领域知识库").click()
        expect(page.get_by_text("产品领域知识库与沉淀中枢")).to_be_visible(timeout=10_000)
        page.get_by_role("button", name="编辑知识条目").click()
        expect(page.locator("[contenteditable='true']").first).to_be_visible(timeout=15_000)
        editor = page.locator("[contenteditable='true']").first
        original = editor.inner_text()
        editor.click()
        page.keyboard.press("Control+A")
        page.keyboard.type(original + "\n\n## UAT 编辑验证")
        page.get_by_role("button", name="保存词条").click()
        expect(page.get_by_text("知识库文档更新成功")).to_be_visible(timeout=10_000)
        page.get_by_role("button", name="AI 排版润色").click()
        expect(page.get_by_role("button", name="确认写入候选稿")).to_be_visible(timeout=10_000)
        expect(page.locator("[contenteditable='true']").first).to_contain_text("AI 自动补充")
        page.get_by_role("button", name="取消").last.click()
        expect(page.get_by_role("button", name="确认写入候选稿")).to_have_count(0)
        page.get_by_role("button", name="AI 排版润色").click()
        expect(page.get_by_role("button", name="确认写入候选稿")).to_be_visible(timeout=10_000)
        page.get_by_role("button", name="确认写入候选稿").click()
        expect(page.get_by_role("button", name="确认写入候选稿")).to_have_count(0)
        expect(page.get_by_text("AI 自动补充与沉淀", exact=False)).to_be_visible(timeout=10_000)
        checks.append("Phase 8 MDXEditor edit and Phase 11 knowledge candidate cancel/confirm")

        # Phase 8 standalone knowledge base editor.
        nav(page, "知识库", "知识库")
        page.get_by_role("button", name="编辑").click()
        expect(page.locator("[contenteditable='true']").first).to_be_visible(timeout=15_000)
        page.get_by_role("button", name="取消").click()
        expect(page.get_by_role("button", name="编辑")).to_be_visible()
        checks.append("Phase 8 standalone editor cancel")

        # Phase 7 product deletion cascade: the task was deleted above, but its
        # linked schedule event still carries the product association.
        nav(page, "产品管理", "产品管理")
        delete_product = page.get_by_role("button", name="删除产品").first
        if not delete_product.count():
            delete_product = page.get_by_role("button", name=re.compile("删除产品 WenXiBuddy")).first
        delete_product.click()
        page.get_by_role("dialog").get_by_role("button", name="确认删除").click()
        expect(page.get_by_text("WenXiBuddy AI 智能协同平台", exact=True)).to_have_count(0)
        deleted_schedule = persisted(page, "nova-schedule").get("state", {}).get("events", [])
        assert any(event["id"] == event_id and not event.get("projectId") for event in deleted_schedule)
        rnd_state = persisted(page, "nova-rnd").get("state", {})
        assert all(not isinstance(value, dict) or "p1" not in value for value in rnd_state.values())
        checks.append("Phase 7 product deletion cascade and R&D cleanup")

        # Phase 9 command palette/chat panel with a deterministic mock provider.
        mock_chat_route(page)
        page.keyboard.press("Control+K")
        expect(page.get_by_text("Nova command palette")).to_be_attached()
        page.get_by_role("button", name="AI 对话").click()
        palette_input = page.get_by_placeholder("问 Nova 做什么...")
        palette_input.fill("创建一个 mock AI 任务")
        palette_input.press("Enter")
        expect(page.get_by_text(re.compile("mock response|mock"))).to_be_visible(timeout=15_000)
        page.keyboard.press("Escape")
        page.get_by_role("button", name=re.compile("AI 助手")).first.click()
        expect(page.get_by_role("heading", name="AI 助手")).to_be_visible(timeout=10_000)
        chat_input = page.get_by_role("textbox", name="输入 AI 问题")
        chat_input.fill("创建一个 mock AI 任务")
        page.get_by_role("button", name="发送消息").click()
        expect(page.get_by_text("mock response", exact=False)).to_be_visible(timeout=15_000)
        mock_task = next(task for task in all_tasks(page) if task["title"] == "Mock AI UAT task")
        checks.append("Phase 9 command palette, chat panel, mock tool loop")

        # Phase 10: destructive AI action must stop for explicit UI confirmation.
        page.unroute("**/api/chat")
        mock_chat_route(page, delete_task_id=mock_task["id"], initial_calls=2)
        chat_input.fill("删除刚创建的 mock AI 任务")
        page.get_by_role("button", name="发送消息").click()
        expect(page.get_by_role("button", name="确认删除")).to_be_visible(timeout=15_000)
        page.get_by_role("button", name="确认删除").click()
        expect(page.get_by_text("Mock AI UAT task", exact=True)).to_have_count(0)
        assert not any(task["id"] == mock_task["id"] for task in all_tasks(page))
        checks.append("Phase 10 destructive AI confirmation")

        # Settings provider boundary: web mode exposes Gemini only and does not render key input.
        page.keyboard.press("Escape")
        nav(page, "设置中心", "设置中心")
        page.get_by_role("button", name="AI 设置").click()
        expect(page.get_by_role("heading", name="AI 设置")).to_be_visible(timeout=10_000)
        expect(page.get_by_role("radio", name=re.compile("Gemini")).first).to_be_visible()
        expect(page.get_by_text(re.compile("不会读取、保存或显示 key"))).to_be_visible()
        checks.append("Phase 9 web provider boundary")

        page.screenshot(path=str(SCREENSHOT_DIR / "nova-pm-workspace-unified-uat.png"), full_page=True)
        print("checks:")
        for check in checks:
            print("PASS", check)
        print("console-errors:", errors)
        print("task-count:", len(all_tasks(page)))
        print("screenshot:", SCREENSHOT_DIR / "nova-pm-workspace-unified-uat.png")
        page.evaluate("localStorage.clear()")
        browser.close()

    if errors:
        print("FAIL browser errors")
        return 1
    print("UAT RESULT: PASS (web mock/provider-boundary coverage; no real provider key used)")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
