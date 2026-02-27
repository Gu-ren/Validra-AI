import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

console.log("Loaded API key:", process.env.OPENAI_API_KEY?.slice(0, 10));

const app = express();

app.use(express.json());

const allowedOrigins = [
    "http://localhost:5173",       // ✅ local dev
    "http://localhost:3000",       // just in case
    "https://your-vercel-app.vercel.app" // future production
  ];
  
  app.use(cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow Postman
  
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "OPTIONS"]
  }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Validra API is running 🚀");
});

app.post("/api/validate", async (req, res) => {
  try {
    const { product, costs, traffic } = req.body;

    if (!product || !costs || !traffic) {
      return res.status(400).json({
        error: "Missing campaign data",
      });
    }

    const {
      sellingPrice = 0,
      costOfGoods = 0,
      shippingCost = 0,
      transactionFees = 0,
    } = costs;

    const totalCostPerUnit = costOfGoods + shippingCost + transactionFees;

    const unitProfit = sellingPrice - totalCostPerUnit;

    const breakEvenCPA = unitProfit;
    const targetROAS =
      totalCostPerUnit > 0 ? sellingPrice / totalCostPerUnit : 0;

    const dailyBudget = traffic.dailyBudget || 0;

    const modeledCPA = breakEvenCPA * 0.7;

    const estimatedDailyConversions =
      modeledCPA > 0 ? Math.floor(dailyBudget / modeledCPA) : 0;

    const estimatedDailyRevenue = estimatedDailyConversions * sellingPrice;

    const estimatedDailyProfit =
      estimatedDailyConversions * unitProfit - dailyBudget;

    // ---------------- AI PROMPT ----------------

    const prompt = `
  You are a senior direct-response marketing strategist.
  
  PRODUCT:
  Name: ${product.productName}
  Description: ${product.description}
  Target Audience: ${product.targetAudience}
  Pain Point: ${product.painPoint}
  Unique Mechanism: ${product.uniqueMechanism}
  
  RETURN ONLY VALID JSON.
  
  The structure MUST be exactly:
  
  {
    "strategicAngles": [
      {
        "id": "1",
        "category": "Fear | Logical | Aspirational | Social Proof",
        "title": "",
        "whyItWorks": "",
        "creativeDirection": ""
      }
    ],
    "headlines": [
      {
        "id": "h1",
        "text": "",
        "hook": "",
        "type": ""
      }
    ],
    "ugcHooks": [
      {
        "id": "u1",
        "script": "",
        "visual": "",
        "angle": ""
      }
    ],
    "psychology": [
      {
        "id": "p1",
        "principle": "",
        "application": "",
        "example": ""
      }
    ]
  }
  
  Generate:
  - 4 strategic angles
  - 4 headlines
  - 3 UGC hooks
  - 3 psychology principles
  `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You must return strictly valid JSON. No explanations.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    let aiParsed;

    try {
      aiParsed = JSON.parse(completion.choices[0].message.content);
    } catch {
      return res.status(500).json({
        error: "AI returned invalid JSON",
      });
    }

    // --------- Shape Validation (Extra Safety) ---------

    aiParsed.strategicAngles = Array.isArray(aiParsed.strategicAngles)
      ? aiParsed.strategicAngles
      : [];

    aiParsed.headlines = Array.isArray(aiParsed.headlines)
      ? aiParsed.headlines
      : [];

    aiParsed.ugcHooks = Array.isArray(aiParsed.ugcHooks)
      ? aiParsed.ugcHooks
      : [];

    aiParsed.psychology = Array.isArray(aiParsed.psychology)
      ? aiParsed.psychology
      : [];

    // ---------------- RESPONSE ----------------

    res.json({
      success: true,
      data: {
        ...aiParsed,
        profitSimulation: {
          sellingPrice,
          totalCostPerUnit,
          unitProfit,
          breakEvenCPA,
          targetROAS: Number(targetROAS.toFixed(2)),
          estimatedDailyConversions,
          estimatedDailyRevenue,
          estimatedDailyProfit,
        },
      },
    });
  } catch (error) {
    console.error("FULL ERROR:", error);

    res.status(500).json({
      error: "Validation failed",
      message: error.message,
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});