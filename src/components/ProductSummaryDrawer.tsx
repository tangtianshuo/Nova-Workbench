import { useProductStore } from '@/src/stores/productStore';
import { useUIStore } from '@/src/stores/uiStore';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
} from '@/src/components/ui/Drawer';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { ProgressBar } from '@/src/components/ui/ProgressBar';

interface ProductSummaryDrawerProps {
  productId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductSummaryDrawer({
  productId,
  open,
  onOpenChange,
}: ProductSummaryDrawerProps) {
  const products = useProductStore((s) => s.products);
  const product = productId
    ? products.find((p) => p.id === productId)
    : undefined;

  const handleOpenDetail = () => {
    if (!product) return;
    useUIStore.setState({
      activeTab: 'product-management',
      selectedProductId: product.id,
    });
    onOpenChange(false);
  };

  const milestoneStatusBadge = (status: string) => {
    if (status === 'completed') return <Badge variant="success">已完成</Badge>;
    if (status === 'in-progress') return <Badge variant="warning">进行中</Badge>;
    return <Badge variant="neutral">待开始</Badge>;
  };

  const progressValue =
    product && product.milestones.length > 0
      ? (product.milestones.filter((m) => m.status === 'completed').length /
          product.milestones.length) *
        100
      : 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent width={360}>
        {product ? (
          <>
            <DrawerHeader
              title={product.name}
              description={`阶段: ${product.stage}`}
            />
            <DrawerBody className="space-y-4">
              {product.tagline && (
                <p className="text-sm text-text-secondary">{product.tagline}</p>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">阶段进度</span>
                  <span className="text-text-tertiary text-xs">
                    {Math.round(progressValue)}%
                  </span>
                </div>
                <ProgressBar value={progressValue} variant="accent" size="sm" />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-text-primary">
                  里程碑
                </h4>
                {product.milestones.length === 0 ? (
                  <p className="text-sm text-text-tertiary">暂未规划里程碑</p>
                ) : (
                  product.milestones.slice(0, 3).map((m, idx) => (
                    <div
                      key={m.id || `m-${idx}`}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-text-primary truncate pr-2">
                        {m.title}
                      </span>
                      {milestoneStatusBadge(m.status)}
                    </div>
                  ))
                )}
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button
                variant="primary"
                className="w-full"
                onClick={handleOpenDetail}
              >
                打开详情
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <>
            <DrawerHeader title="产品不存在" />
            <DrawerBody>
              <p className="text-sm text-text-secondary">该产品已被删除</p>
            </DrawerBody>
            <DrawerFooter>
              <Button variant="secondary" className="w-full" disabled>
                打开详情
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
