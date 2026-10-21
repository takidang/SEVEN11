using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SevenEleven.Core.Migrations
{
    /// <inheritdoc />
    public partial class LoginLockout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FailedLogins",
                table: "Employees",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "LockedUntil",
                table: "Employees",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FailedLogins",
                table: "Customers",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "LockedUntil",
                table: "Customers",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FailedLogins",
                table: "Employees");

            migrationBuilder.DropColumn(
                name: "LockedUntil",
                table: "Employees");

            migrationBuilder.DropColumn(
                name: "FailedLogins",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "LockedUntil",
                table: "Customers");
        }
    }
}
