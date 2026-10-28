// The example brief (fictional brand; real public references): prefilled on the new-campaign form
// so a first run takes one click, and used for the precomputed showcase campaign.

export const EXAMPLE_BRIEF = {
  name: "Summer cold brew launch",
  brandName: "Juniper Coffee",
  productName: "Cold Brew Concentrate",
  productDescription: "A coffee concentrate for making iced coffee and coffee desserts at home in under a minute.",
  objective: "Launch in the US with original creator-made videos for paid social; learn which creative world to scale.",
  notes:
    "Customer interviews: people who buy specialty coffee like Blue Bottle Coffee and Stumptown Coffee Roasters, listen to Khruangbin, and watch The Bear. Our team believes they cook and host at home.",
  deliverables: "3 vertical videos with 6 opening hooks; paid usage for 12 months",
  constraints: "No alcohol pairings. No claims about caffeine or health.",
  audience: [
    { text: "Customers mention Khruangbin and The Bear in interviews", source: "research" },
    { text: "They enjoy home cooking and hosting friends", source: "assumption" },
    { text: "Specialty coffee drinkers in their late twenties and thirties", source: "team" },
  ],
} as const;
