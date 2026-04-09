const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

async function getEbayToken() {
  const credentials = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString("base64");

  const response = await axios.post(
    "https://api.ebay.com/identity/v1/oauth2/token",
    "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return response.data.access_token;
}

app.get("/search", async (req, res) => {
  const { query, condition, size } = req.query;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const token = await getEbayToken();

    let filterString = "buyingOptions:{FIXED_PRICE}";
    if (condition) {
      const condMap = {
        "Like New / NWT": "1000",
        "Excellent": "1500",
        "Good": "3000",
        "Fair": "5000",
        "Poor": "6000",
      };
      const condCode = condMap[condition];
      if (condCode) filterString += `,conditionIds:{${condCode}}`;
    }

    const searchQuery = [query, size].filter(Boolean).join(" ");

    const response = await axios.get(
      "https://api.ebay.com/buy/browse/v1/item_summary/search",
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          q: searchQuery,
          category_ids: "11450",
          filter: filterString,
          sort: "endTimeSoonest",
          limit: 20,
        },
      }
    );

    const items = (response.data.itemSummaries || []).map((item) => ({
      title: item.title,
      price: parseFloat(item.price?.value || 0),
      condition: item.condition,
      soldDate: item.itemEndDate,
      url: item.itemWebUrl,
      image: item.image?.imageUrl,
    }));

    const prices = items.map((i) => i.price).filter((p) => p > 0);
    const avgPrice = prices.length
      ? prices.reduce((a, b) => a + b, 0) / prices.length
      : 0;
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;

    res.json({
      items,
      stats: {
        count: prices.length,
        avgPrice: Math.round(avgPrice * 100) / 100,
        minPrice: Math.round(minPrice * 100) / 100,
        maxPrice: Math.round(maxPrice * 100) / 100,
      },
    });
  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).json({ error: "eBay search failed", detail: err.message });
  }
});

app.get("/", (req, res) => res.send("Thrift Flip Server is running!"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
