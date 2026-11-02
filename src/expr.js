"use strict";
// Expressions: any text field can contain {{ ... }} with JavaScript inside.
//   {{ $json.title }}   {{ $node["AI Chat"].json.text }}   {{ $now }}
// If the whole field is one expression, the raw value (object/number) is kept.
const vm = require("node:vm");

const ONE = /^\s*\{\{([\s\S]+?)\}\}\s*$/;
const MANY = /\{\{([\s\S]+?)\}\}/g;

function buildContext(base) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return Object.assign({
    $now: now.toISOString(),
    $today: today,
    $time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  }, base);
}

function evalCode(code, ctx) {
  try {
    return vm.runInNewContext(`(${code})`, ctx, { timeout: 1000 });
  } catch (e) {
    throw new Error(`Expression {{${code.trim()}}} failed: ${e.message}`);
  }
}

function toText(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function evaluate(value, base) {
  if (typeof value !== "string" || !value.includes("{{")) return value;
  const ctx = vm.createContext(buildContext(base));
  const one = value.match(ONE);
  if (one && !one[1].includes("{{") && !one[1].includes("}}")) return evalCode(one[1], ctx);
  return value.replace(MANY, (_, code) => toText(evalCode(code, ctx)));
}

module.exports = { evaluate, toText };
