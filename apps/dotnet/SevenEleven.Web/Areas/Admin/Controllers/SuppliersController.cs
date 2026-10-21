using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>Nhà cung cấp. Quản trị thêm/sửa/ngừng hợp tác (không xoá); quản lý chỉ xem.</summary>
public class SuppliersController(AppDbContext db, ChainAdminService chain) : AdminController(db)
{
    public async Task<IActionResult> Index(string? q, string? status)
    {
        var scope = ScopeStoreId;
        var suppliers = await Db.Suppliers.AsNoTracking().OrderBy(s => s.Code).ToListAsync();
        var poCounts = await Db.PurchaseOrders.Where(p => scope == null || p.StoreId == scope)
            .GroupBy(p => p.SupplierId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
        var digits = Text.Digits(q);
        var folded = Text.Fold(q?.Trim());
        var list = suppliers.Where(s =>
                (status != "dang-hop-tac" || s.Status == SupplierStatus.Active) && (status != "ngung" || s.Status == SupplierStatus.Inactive) &&
                (string.IsNullOrWhiteSpace(q) || Text.Fold($"{s.Code} {s.Name} {s.ContactName} {s.Email}").Contains(folded)
                 || (digits.Length >= 3 && (s.Phone.Contains(digits) || s.TaxCode.Contains(digits)))))
            .ToList();
        var categories = await Db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name);
        ViewData["Title"] = "Nhà cung cấp";
        return View(new SupplierListModel(list, suppliers.Count, suppliers.Count(s => s.Status == SupplierStatus.Active), poCounts, categories, q, status));
    }

    public async Task<IActionResult> Detail(string id)
    {
        var supplier = await Db.Suppliers.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id || s.Code == id);
        if (supplier is null) return NotFound();
        var scope = ScopeStoreId;
        var orders = await Db.PurchaseOrders.AsNoTracking().Include(p => p.Store).Include(p => p.Items)
            .Where(p => p.SupplierId == supplier.Id && (scope == null || p.StoreId == scope))
            .OrderByDescending(p => p.CreatedAt).ToListAsync();
        var categories = await Db.Categories.AsNoTracking().OrderBy(c => c.SortOrder).ToListAsync();
        ViewData["Title"] = supplier.Name;
        return View(new SupplierDetailModel(supplier, orders, categories, scope is null));
    }

    public async Task<IActionResult> Edit(string? id)
    {
        if (!CanManage) return RedirectToAction(nameof(Index));
        var supplier = id is null ? null : await Db.Suppliers.FindAsync(id);
        if (id is not null && supplier is null) return NotFound();
        return await FormAsync(supplier is null ? new SupplierInput() : SupplierInput.From(supplier), supplier, null);
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Save(SupplierInput input)
    {
        var result = await chain.SaveSupplierAsync(input);
        if (!result.Ok)
        {
            var existing = input.Id is null ? null : await Db.Suppliers.AsNoTracking().FirstOrDefaultAsync(s => s.Id == input.Id);
            return await FormAsync(input, existing, result.Errors);
        }
        Toast($"{(input.Id is null ? "Đã thêm nhà cung cấp" : "Đã lưu thông tin nhà cung cấp")}: {result.Value!.Code} · {result.Value.Name}");
        return RedirectToAction(nameof(Detail), new { id = result.Value.Id });
    }

    private async Task<IActionResult> FormAsync(SupplierInput input, Supplier? existing, FormErrors? errors)
    {
        var categories = await Db.Categories.AsNoTracking().OrderBy(c => c.SortOrder).ToListAsync();
        ViewData["Title"] = existing is null ? "Thêm nhà cung cấp" : $"Sửa {existing.Code}";
        return View("Edit", new SupplierFormModel(input, existing, categories, errors ?? new FormErrors()));
    }
}

public record SupplierListModel(List<Supplier> Suppliers, int Total, int Active, Dictionary<string, int> PurchaseCounts, Dictionary<string, string> Categories, string? Query, string? Status);

public record SupplierDetailModel(Supplier Supplier, List<PurchaseOrder> Orders, List<Category> Categories, bool IsChain);

public record SupplierFormModel(SupplierInput Input, Supplier? Existing, List<Category> Categories, FormErrors Errors);
