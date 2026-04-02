import type {
  BaseRates,
  DiurnalProfile,
  WeekdayProfile,
  GeoProfile,
  SafetyCaps,
} from "./schema";
import { simulationConfig } from "./env";
import { authConfig } from "@/lib/auth/config";

export const DEFAULT_BASE_RATES: BaseRates = {
  signupsPerTick: 0.8,
  activeUsersPerTick: 10,
  cartAddsPerTick: 4,
  checkoutsPerTick: 3,
  cancellationRate: 0.08,
  supportCaseRate: 0.05,
};

export const DEFAULT_DIURNAL_PROFILE: DiurnalProfile = {
  "0": 0.1,
  "1": 0.08,
  "2": 0.05,
  "3": 0.05,
  "4": 0.08,
  "5": 0.15,
  "6": 0.3,
  "7": 0.5,
  "8": 0.6,
  "9": 0.8,
  "10": 1.0,
  "11": 1.4,
  "12": 1.5,
  "13": 1.2,
  "14": 0.7,
  "15": 0.5,
  "16": 0.6,
  "17": 1.2,
  "18": 1.8,
  "19": 1.7,
  "20": 1.3,
  "21": 0.8,
  "22": 0.4,
  "23": 0.2,
};

export const DEFAULT_WEEKDAY_PROFILE: WeekdayProfile = {
  "0": 1.2, // Sunday
  "1": 0.9, // Monday
  "2": 0.9, // Tuesday
  "3": 1.0, // Wednesday
  "4": 1.0, // Thursday
  "5": 1.3, // Friday
  "6": 1.5, // Saturday
};

export const DEFAULT_GEO_PROFILE: GeoProfile = {
  us_east: { weight: 1.2, timezone: "America/New_York" },
  us_central: { weight: 1.0, timezone: "America/Chicago" },
  us_west: { weight: 1.1, timezone: "America/Los_Angeles" },
  eu_west: { weight: 0.7, timezone: "Europe/London" },
};

export const DEFAULT_SAFETY_CAPS: SafetyCaps = {
  maxActionsPerTick: 50,
  maxSignupsPerDay: 300,
};

export const REGIONS = Object.keys(DEFAULT_GEO_PROFILE);

export const SIM_PASSWORD_PREFIX = "Sim!";

export function getSimPassword(): string {
  const secret = simulationConfig.server.cronSecret;
  return `${SIM_PASSWORD_PREFIX}${secret.slice(0, 16)}`;
}

export function getBaseUrl(): string {
  return authConfig.server.url;
}

export const MENU_ITEM_DEFINITIONS = [
  {
    name: "Classic Burger",
    category: "burgers",
    priceInCents: 1299,
    popularityWeight: 3,
  },
  {
    name: "Bacon Cheeseburger",
    category: "burgers",
    priceInCents: 1499,
    popularityWeight: 4,
  },
  {
    name: "Veggie Burger",
    category: "burgers",
    priceInCents: 1199,
    popularityWeight: 2,
  },
  {
    name: "Margherita Pizza",
    category: "pizza",
    priceInCents: 1599,
    popularityWeight: 4,
  },
  {
    name: "Pepperoni Pizza",
    category: "pizza",
    priceInCents: 1699,
    popularityWeight: 5,
  },
  {
    name: "BBQ Chicken Pizza",
    category: "pizza",
    priceInCents: 1799,
    popularityWeight: 3,
  },
  {
    name: "Caesar Salad",
    category: "salads",
    priceInCents: 999,
    popularityWeight: 2,
  },
  {
    name: "Garden Salad",
    category: "salads",
    priceInCents: 899,
    popularityWeight: 1,
  },
  {
    name: "Greek Salad",
    category: "salads",
    priceInCents: 1099,
    popularityWeight: 2,
  },
  {
    name: "French Fries",
    category: "sides",
    priceInCents: 499,
    popularityWeight: 5,
  },
  {
    name: "Onion Rings",
    category: "sides",
    priceInCents: 599,
    popularityWeight: 3,
  },
  {
    name: "Mozzarella Sticks",
    category: "sides",
    priceInCents: 699,
    popularityWeight: 3,
  },
  { name: "Cola", category: "drinks", priceInCents: 299, popularityWeight: 4 },
  {
    name: "Lemonade",
    category: "drinks",
    priceInCents: 349,
    popularityWeight: 3,
  },
  {
    name: "Iced Tea",
    category: "drinks",
    priceInCents: 299,
    popularityWeight: 2,
  },
  {
    name: "Chocolate Milkshake",
    category: "drinks",
    priceInCents: 599,
    popularityWeight: 3,
  },
  {
    name: "Brownie Sundae",
    category: "desserts",
    priceInCents: 799,
    popularityWeight: 2,
  },
  {
    name: "Cheesecake Slice",
    category: "desserts",
    priceInCents: 699,
    popularityWeight: 2,
  },
] as const;

export const DRIVER_DEFINITIONS = [
  { name: "Marcus Johnson", phone: "+1-555-0101" },
  { name: "Sarah Chen", phone: "+1-555-0102" },
  { name: "David Rodriguez", phone: "+1-555-0103" },
  { name: "Emily Williams", phone: "+1-555-0104" },
  { name: "James Wilson", phone: "+1-555-0105" },
  { name: "Aisha Patel", phone: "+1-555-0106" },
  { name: "Ryan Thompson", phone: "+1-555-0107" },
  { name: "Jessica Martinez", phone: "+1-555-0108" },
  { name: "Michael Brown", phone: "+1-555-0109" },
  { name: "Lisa Anderson", phone: "+1-555-0110" },
  { name: "Kevin Lee", phone: "+1-555-0111" },
  { name: "Nicole Davis", phone: "+1-555-0112" },
] as const;

export const ADMIN_DEFINITIONS = [
  { name: "Admin Alice", email: "alice@caspers.kitchen" },
  { name: "Admin Bob", email: "bob@caspers.kitchen" },
  { name: "Admin Carol", email: "carol@caspers.kitchen" },
] as const;

export const SUPPORT_SUBJECTS = [
  "Late delivery",
  "Wrong order received",
  "Missing items",
  "Cold food",
  "Driver was rude",
  "Overcharged",
  "App not working",
  "Refund request",
  "Delivery never arrived",
  "Food quality issue",
] as const;

export const SUPPORT_USER_MESSAGES = [
  "I've been waiting for over an hour now. Where is my food?",
  "The order I received is completely wrong. I ordered something different.",
  "Half of my items are missing from the order.",
  "The food arrived cold and soggy. Very disappointed.",
  "Can I get a refund for this? The quality was terrible.",
  "My delivery was supposed to arrive 30 minutes ago. What's going on?",
  "The driver couldn't find my address and left the food somewhere else.",
  "I was charged twice for the same order.",
  "I need to speak with a manager about this experience.",
  "This is the second time this has happened. Very frustrating.",
] as const;

export const SUPPORT_ADMIN_REPLIES = [
  "I'm sorry to hear about your experience. Let me look into this right away.",
  "Thank you for reaching out. I've located your order and I'm checking the status now.",
  "I apologize for the inconvenience. I've initiated a refund for the affected items.",
  "I understand your frustration. Let me connect you with our delivery team to resolve this.",
  "Thank you for your patience. I've credited your account for the trouble.",
  "I've escalated this to our quality team. You should receive an update shortly.",
  "I'm sorry about this. We're issuing a replacement order at no extra charge.",
  "Thank you for letting us know. We've addressed this with the driver.",
] as const;
