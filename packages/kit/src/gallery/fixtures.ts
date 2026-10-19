/**
 * Comprehensive Fixtures for @wealthgap/kit Components and Primitives
 * Includes standard and stress fixtures (huge numbers, very long labels, zero, negative).
 */

export const GALLERY_FIXTURES = {
  label: {
    standard: {
      text: "SHADOW MARKET",
      accent: "rose" as const,
      size: 96,
      track: 0.08,
    },
    stressLong: {
      text: "TRANSNATIONAL OVER-THE-COUNTER DERIVATIVE EXPOSURES & LIQUIDITY MATRIX",
      accent: "mint" as const,
      size: 34,
      track: 0.04,
    },
  },
  counter: {
    standard: {
      from: 0,
      to: 9.6,
      decimals: 1,
      prefix: "$",
      suffix: "T",
      size: 90,
      color: "accent",
      sublabel: "Daily global volume",
    },
    stressHuge: {
      from: 0,
      to: 142857000,
      decimals: 0,
      prefix: "$",
      suffix: "",
      size: 58,
      color: "mint",
      sublabel: "Total contracts settled",
    },
    stressZero: {
      from: 100,
      to: 0,
      decimals: 2,
      prefix: "",
      suffix: "%",
      size: 58,
      color: "muted",
      sublabel: "Collateral reserve delta",
    },
    stressNegative: {
      from: 0,
      to: -45.2,
      decimals: 1,
      prefix: "",
      suffix: "%",
      size: 58,
      color: "negative",
      sublabel: "Net liquidity draw",
    },
  },
  panel: {
    standard: {
      w: 480,
      h: 280,
      radius: 20,
      color: "surface",
      stitch: true,
      rimColors: ["lav", "sky", "mint"],
    },
  },
  objects: {
    orb: {
      radius: 95,
      color: "mint" as const,
      ring: true,
    },
    gem: {
      radius: 85,
      color: "peach" as const,
    },
    coin: {
      radius: 80,
      color: "butter" as const,
    },
    sparkle: {
      size: 44,
      color: "butter",
    },
  },
  shortcuts: {
    bigNumber: {
      standard: {
        value: 9.6,
        prefix: "$",
        suffix: "T",
        decimals: 1,
        label: "GLOBAL FOREX TRADING",
        sublabel: "Daily volume exceeding total equity market capitalization",
        accentColor: "#F5B83D",
      },
      stressHuge: {
        value: 540000000000000,
        prefix: "$",
        suffix: "",
        decimals: 0,
        label: "NOTIONAL DERIVATIVES MATRIX",
        sublabel: "Total gross market valuation across OTC swap agreements",
        accentColor: "#A8E6CF",
      },
    },
    barCompare: {
      standard: {
        title: "Foreign Exchange Turnover by Currency",
        subtitle: "Percentage share of total gross daily turnover (200% maximum)",
        unitPrefix: "",
        unitSuffix: "%",
        items: [
          { label: "US Dollar (USD)", value: 88, formattedValue: "88%", color: "#F5B83D", highlight: true },
          { label: "Euro (EUR)", value: 31, formattedValue: "31%", color: "#A8E6CF", highlight: false },
          { label: "Japanese Yen (JPY)", value: 17, formattedValue: "17%", color: "#A8D8FF", highlight: false },
          { label: "British Pound (GBP)", value: 13, formattedValue: "13%", color: "#C7B8FF", highlight: false },
        ],
      },
      stressNegativeZero: {
        title: "Net Capital Flow Variance",
        subtitle: "Quarter-over-quarter percentage shifts including deficit contractions",
        unitPrefix: "",
        unitSuffix: "%",
        items: [
          { label: "Offshore Yuan", value: 18.5, formattedValue: "+18.5%", color: "#3DDC97", highlight: false },
          { label: "Stablecoins", value: 0.0, formattedValue: "0.0%", color: "#8A8A94", highlight: false },
          { label: "Emerging Debt", value: -28.4, formattedValue: "-28.4%", color: "#FF5A5F", highlight: true },
        ],
      },
    },
    lineDraw: {
      standard: {
        title: "Daily FX Trading Volume (1989 - 2025)",
        unitPrefix: "$",
        unitSuffix: "T",
        color: "#F5B83D",
        data: [
          { x: "1989", y: 0.6, label: "$0.6T" },
          { x: "1995", y: 1.2, label: "$1.2T" },
          { x: "2004", y: 1.9, label: "$1.9T" },
          { x: "2010", y: 4.0, label: "$4.0T" },
          { x: "2016", y: 5.1, label: "$5.1T" },
          { x: "2022", y: 7.5, label: "$7.5T" },
          { x: "2025", y: 9.6, label: "$9.6T" },
        ],
        peakCallout: "2025 Peak: $9.6 Trillion / Day",
      },
    },
    sizeCompare: {
      standard: {
        title: "Market Capitalization vs Daily Turnover",
        subtitle: "Proportional volume comparison",
        unitPrefix: "$",
        unitSuffix: "B",
        items: [
          { label: "NYSE Stock Market", value: 35, displayValue: "$35B / Day", color: "#A8D8FF" },
          { label: "US Treasury Bonds", value: 650, displayValue: "$650B / Day", color: "#C7B8FF" },
          { label: "Global FX Market", value: 2400, displayValue: "$2,400B / Day", color: "#F5B83D" },
        ],
      },
    },
    iconGrid: {
      standard: {
        title: "Global FX Concentration",
        subtitle: "London and New York handle 65% of all daily transactions",
        totalCount: 100,
        highlightCount: 65,
        highlightLabel: "London + NY (65%)",
        remainingLabel: "Rest of World (35%)",
        highlightColor: "#F5B83D",
        baseColor: "#2A3749",
        iconType: "square" as const,
      },
    },
    moneyFlow: {
      standard: {
        title: "Cross-Border Settlement Highway",
        subtitle: "Continuous linked settlement interbank transfers",
        flowColor: "#F5B83D",
        nodes: [
          { id: "importers", label: "Commercial Importers", color: "#A8D8FF" },
          { id: "cls", label: "CLS Bank Settlement", color: "#F5B83D" },
          { id: "dealers", label: "Dealer Banks (Tier 1)", color: "#A8E6CF" },
        ],
        transfers: [
          { fromId: "importers", toId: "cls", amountLabel: "$1.4T / Day" },
          { fromId: "cls", toId: "dealers", amountLabel: "$8.2T / Day" },
        ],
      },
    },
    cards: {
      titleCard: {
        chapterBadge: "CHAPTER 01",
        title: "THE ENGINE OF CURRENCIES",
        subtitle: "How sovereign central banks and commercial titans move trillions without paper cash.",
        accentColor: "#F5B83D",
      },
      termCard: {
        category: "FINANCIAL ARCHITECTURE",
        term: "Continuous Linked Settlement",
        definition: "A specialized multi-currency cash settlement system that eliminates foreign exchange settlement risk through payment-versus-payment settlement.",
        highlightWord: "payment-versus-payment",
        accentColor: "#A8E6CF",
      },
      sourceTag: {
        text: "Bank for International Settlements • Triennial Central Bank Survey 2025",
        dataRef: "Table 1.1 Gross FX Turnover",
      },
    },
    globe3d: {
      standard: {
        title: "Global FX Liquidity Hubs",
        subtitle: "Interbank Settlement Network (24/7 Continuous Liquidity)",
        rotationSpeed: 0.015,
        glowColor: "#F5B83D",
        nodeColor: "#2EC4B6",
      },
    },
  },
};
