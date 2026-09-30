import { CategoryRails, NewProductsRail } from "./_components/home/category-rails"
import { CategoryStrip } from "./_components/home/category-strip"
import { CollectionTiles } from "./_components/home/collection-tiles"
import { FlashSaleSection } from "./_components/home/flash-sale-section"
import { HeroBanners } from "./_components/home/hero-banners"

/** Storefront home — mirrors the 7-eleven.vn home: banners, collections, categories, flash sale, rails. */
export default function HomePage() {
  return (
    <div className="space-y-8">
      <h1 className="sr-only">7-Eleven – mở cửa 24 giờ, giao hàng 24 phút</h1>
      <HeroBanners />
      <CollectionTiles />
      <CategoryStrip />
      <FlashSaleSection />
      <NewProductsRail />
      <CategoryRails />
    </div>
  )
}
