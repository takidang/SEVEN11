import type { Metadata } from "next"

import { products } from "@/data/catalog"
import { findProductBySlug } from "@/lib/catalog"

import { ProductView } from "./_components/product-view"

export async function generateMetadata({ params }: PageProps<"/san-pham/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const product = findProductBySlug(products, slug)
  return { title: product?.name ?? "Chi tiết sản phẩm" }
}

/**
 * The product is resolved on the client: products created in the back office live
 * only in the browser DB, so the 404 decision waits until that DB is loaded.
 */
export default async function ProductPage({ params }: PageProps<"/san-pham/[slug]">) {
  const { slug } = await params
  return <ProductView slug={slug} />
}
