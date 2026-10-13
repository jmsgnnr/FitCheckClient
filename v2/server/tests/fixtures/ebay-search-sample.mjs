/**
 * Synthetic eBay Browse search payload for contract tests only.
 * Not a real seller listing; do not surface in production UI.
 */
export const FIXTURE_SEARCH_RESPONSE = {
  href: "https://api.ebay.com/buy/browse/v1/item_summary/search?q=test",
  total: 2,
  itemSummaries: [
    {
      itemId: "v1|123456789012|0",
      title: "[FIXTURE] Vintage chore coat — contract test item A",
      itemWebUrl: "https://www.ebay.com/itm/123456789012",
      price: { value: "48.00", currency: "USD" },
      shippingOptions: [
        { shippingCost: { value: "8.50", currency: "USD" } },
      ],
      condition: "USED",
      seller: { username: "fixture_seller_a" },
      image: {
        imageUrl: "https://i.ebayimg.com/images/g/fixture-a/s-l500.jpg",
      },
      localizedAspects: [{ name: "Size", value: "L" }],
    },
    {
      itemId: "v1|123456789012|0",
      title: "[FIXTURE] Duplicate id should dedupe",
      itemWebUrl: "https://www.ebay.com/itm/123456789012-dup",
      price: { value: "10.00", currency: "USD" },
      condition: "NEW",
    },
    {
      itemId: "v1|987654321098|0",
      title: "[FIXTURE] Contract test item B — shipping unknown",
      itemWebUrl: "https://www.ebay.com/itm/987654321098",
      price: { value: "35.00", currency: "USD" },
      condition: "3000",
    },
    {
      itemId: "bad|item",
      title: "Rejected http url",
      itemWebUrl: "http://insecure.example/item",
      price: { value: "1.00", currency: "USD" },
    },
  ],
};
