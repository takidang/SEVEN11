using System.Diagnostics.CodeAnalysis;
using System.Text;
using Microsoft.AspNetCore.Http;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Areas.Admin.Controllers;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Tests;

/// <summary>Phần nằm ở tầng web: file CSV xuất báo cáo, tìm đơn không dấu, bill tạm giữ ở quầy.</summary>
public class WebLayerTests
{
    // ---------------------------------------------------------------- CSV

    [Fact]
    public void Csv_has_bom_crlf_quotes_and_blocks_formulas()
    {
        var csv = new CsvWriter()
            .Row("Tên", "Số", "Tỷ lệ")
            .Row("=HYPERLINK(\"x\")", 1_250_000L, new CsvPercent(0.1234))
            .Row("Bánh, kẹo", -5, new CsvPercent(null))
            .Row("-12,5%", "+84 901", "@tag")
            .Row(" có khoảng trắng ", "dòng\nhai", new DateTime(2026, 10, 6));
        var bytes = csv.ToBytes();
        Assert.Equal(Encoding.UTF8.GetPreamble(), bytes[..3]);
        var lines = Encoding.UTF8.GetString(bytes[3..]).Split("\r\n");
        Assert.Equal("Tên,Số,Tỷ lệ", lines[0]);
        Assert.Equal("\"'=HYPERLINK(\"\"x\"\")\",1250000,\"12,3%\"", lines[1]);
        Assert.Equal("\"Bánh, kẹo\",-5,", lines[2]);
        Assert.Equal("\"-12,5%\",'+84 901,'@tag", lines[3]);
        Assert.StartsWith("\" có khoảng trắng \",\"dòng\nhai\",06/10/2026", string.Join("\r\n", lines[4..]));
        Assert.EndsWith("\r\n", Encoding.UTF8.GetString(bytes));
    }

    [Theory]
    [InlineData("0901234567", "0901 234 567")]
    [InlineData("02873001006", "028 7300 1006")]
    [InlineData("02743900102", "0274 390 0102")]
    [InlineData("12345", "12345")]
    public void Phone_numbers_read_like_the_nextjs_app(string raw, string shown) => Assert.Equal(shown, Phone.Format(raw));

    // ---------------------------------------------------------------- tìm đơn

    [Theory]
    [InlineData("dh2610", true)]       // mã đơn, không phân biệt hoa thường
    [InlineData("tran thu ha", true)]  // tên không dấu
    [InlineData("Thu Hà", true)]
    [InlineData("4567", true)]         // ≥ 3 số: tìm theo SĐT
    [InlineData("45", false)]          // < 3 số thì không tìm SĐT
    [InlineData("Nguyễn", false)]
    public void Order_search_matches_code_name_and_phone(string q, bool expected)
    {
        var row = new OrderRow("od-1", "DH26100600012", OrderStatus.Pending, DateTime.Now, 100_000,
            "Trần Thu Hà", "0901234567", "Trần Thu Hà", "0901234567");
        Assert.Equal(expected, row.Matches(q));
    }

    // ---------------------------------------------------------------- bill tạm giữ

    private static (PosBillStore Bill, PosHoldStore Held) Pos()
    {
        var context = new DefaultHttpContext { Session = new MemorySession() };
        var bill = new PosBillStore(new HttpContextAccessor { HttpContext = context });
        return (bill, new PosHoldStore(context.Session, bill));
    }

    [Fact]
    public void Holding_parks_the_bill_and_restoring_swaps_with_the_current_one()
    {
        var (bill, held) = Pos();
        var now = new DateTime(2026, 10, 6, 9, 0, 0);
        Assert.Null(held.Hold(now));                      // hoá đơn trống thì không giữ

        bill.Add("p1", 2);
        bill.SetCustomer("cu-1");
        bill.SetCode("GIAM10");
        var first = held.Hold(now)!;
        Assert.Empty(bill.Lines());
        Assert.Null(bill.CustomerId());

        bill.Add("p2", 1);
        held.Restore(first.Id, now.AddMinutes(3));
        Assert.Equal([new CartLine("p1", 2)], bill.Lines());
        Assert.Equal("cu-1", bill.CustomerId());
        Assert.Equal("GIAM10", bill.Code());
        var parked = Assert.Single(held.All());         // bill p2 đang bấm dở được giữ thay chỗ
        Assert.Equal("p2", parked.Lines.Single().ProductId);
        Assert.True(held.Discard(parked.Id));
        Assert.Empty(held.All());
    }

    [Fact]
    public void At_most_ten_bills_can_be_held()
    {
        var (bill, held) = Pos();
        for (var i = 0; i < PosHoldStore.Max; i++)
        {
            bill.Add($"p{i}", 1);
            Assert.NotNull(held.Hold(DateTime.Now));
        }
        bill.Add("p-extra", 1);
        Assert.True(held.IsFull);
        Assert.Null(held.Hold(DateTime.Now));
        Assert.Single(bill.Lines());
    }

    /// <summary>Phiên làm việc giả trong bộ nhớ cho bài kiểm thử.</summary>
    private sealed class MemorySession : ISession
    {
        private readonly Dictionary<string, byte[]> _data = [];
        public bool IsAvailable => true;
        public string Id => "test";
        public IEnumerable<string> Keys => _data.Keys;
        public void Clear() => _data.Clear();
        public Task CommitAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task LoadAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
        public void Remove(string key) => _data.Remove(key);
        public void Set(string key, byte[] value) => _data[key] = value;
        public bool TryGetValue(string key, [NotNullWhen(true)] out byte[]? value) => _data.TryGetValue(key, out value);
    }
}
