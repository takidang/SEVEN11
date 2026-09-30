import { NotFoundPanel } from "../../_components/not-found-panel"

export default function ProductNotFound() {
  return (
    <NotFoundPanel
      title="Không tìm thấy sản phẩm"
      description="Sản phẩm có thể đã ngừng kinh doanh hoặc đường dẫn không đúng. Bạn thử tìm bằng ô tìm kiếm phía trên nhé."
    />
  )
}
