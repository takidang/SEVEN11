using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SevenEleven.Core.Migrations
{
    /// <inheritdoc />
    public partial class PartialReceiving : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ClosedBy",
                table: "PurchaseOrders",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClosedReason",
                table: "PurchaseOrders",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReceivedQuantity",
                table: "PurchaseOrderItems",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // Phiếu đã nhập kho từ trước khi có nhận nhiều đợt: mọi dòng coi như đã nhận đủ (Status 2 = Received).
            migrationBuilder.Sql(
                "UPDATE PurchaseOrderItems SET ReceivedQuantity = Quantity " +
                "WHERE PurchaseOrderId IN (SELECT Id FROM PurchaseOrders WHERE Status = 2);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ClosedBy",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "ClosedReason",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "ReceivedQuantity",
                table: "PurchaseOrderItems");
        }
    }
}
