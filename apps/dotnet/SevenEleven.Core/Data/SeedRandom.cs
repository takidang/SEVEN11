namespace SevenEleven.Core.Data;

/// <summary>
/// Bộ sinh số ngẫu nhiên có hạt giống cố định, giống lib/random.ts: dữ liệu mẫu ra y hệt nhau trên
/// mọi máy, chỉ xê dịch theo ngày chạy.
/// </summary>
public class SeedRandom(int seed)
{
    private readonly Random _random = new(seed);

    public double Next() => _random.NextDouble();

    /// <summary>Số nguyên trong [min, max], tính cả hai đầu.</summary>
    public int Int(int min, int max) => _random.Next(min, max + 1);

    public bool Chance(double probability) => _random.NextDouble() < probability;

    public T Pick<T>(IReadOnlyList<T> items) => items[_random.Next(items.Count)];

    /// <summary>Chọn theo trọng số: Weighted([("a", 3), ("b", 1)]).</summary>
    public T Weighted<T>(IReadOnlyList<(T Value, double Weight)> entries)
    {
        var total = entries.Sum(e => e.Weight);
        var roll = _random.NextDouble() * total;
        foreach (var (value, weight) in entries)
        {
            roll -= weight;
            if (roll <= 0) return value;
        }
        return entries[^1].Value;
    }

    public List<T> Shuffle<T>(IEnumerable<T> items)
    {
        var copy = items.ToList();
        for (var i = copy.Count - 1; i > 0; i--)
        {
            var j = _random.Next(i + 1);
            (copy[i], copy[j]) = (copy[j], copy[i]);
        }
        return copy;
    }
}
