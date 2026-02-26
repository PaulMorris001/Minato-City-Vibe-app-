import Stripe from "stripe";
import config from "./env.js";

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: "2024-12-18.acacia",
});

export default stripe;
