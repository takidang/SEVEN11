import type { Metadata } from "next"
import { Suspense } from "react"

import { SearchSkeleton, SearchView } from "./_components/search-view"

export async function generateMetadata({ searchParams }: PageProps<"/tim-kiem">): Promise<Metadata> {
  const { q } = await searchParams
  const query = (Array.isArray(q) ? q[0] : q)?.trim()
  return { title: query ? `Tìm “${query}”` : "Tìm kiếm" }
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchView />
    </Suspense>
  )
}
