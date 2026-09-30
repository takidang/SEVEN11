import { NotFoundPanel } from "../../_components/not-found-panel"

export default function CategoryNotFound() {
  return (
    <NotFoundPanel
      title="Không tìm thấy danh mục"
      description="Danh mục này không tồn tại hoặc đã được đổi tên. Bạn chọn danh mục ở thanh bên trái hoặc xem gợi ý bên dưới."
    />
  )
}
