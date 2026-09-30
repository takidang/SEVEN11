import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { categories } from "@/data/catalog"
import { findCategory } from "@/lib/catalog"

import { CategorySkeleton, CategoryView } from "./_components/category-view"

export async function generateMetadata({ params }: PageProps<"/danh-muc/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const category = findCategory(categories, slug)
  return { title: category?.name ?? "Không tìm thấy danh mục" }
}

/** Categories are fixed (no back-office action edits them), so an unknown slug is a real 404. */
export default async function CategoryPage({ params }: PageProps<"/danh-muc/[slug]">) {
  const { slug } = await params
  const category = findCategory(categories, slug)
  if (!category) notFound()

  return (
    <Suspense fallback={<CategorySkeleton />}>
      <CategoryView slug={category.slug} />
    </Suspense>
  )
}
