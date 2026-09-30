import type { Metadata } from "next"

import { PosScreen } from "./_components/pos-screen"

export const metadata: Metadata = {
  title: "Bán tại quầy",
}

export default function PosPage() {
  return <PosScreen />
}
