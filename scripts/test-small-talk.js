import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(root, "api", "chat.js"), "utf8");
const start = code.indexOf("function classifySmallTalk");
const end = code.indexOf("function isGreetingOnly");

assert.ok(start >= 0 && end > start, "Could not locate small-talk classifier in api/chat.js");

const scope = {};
new Function("scope", `${code.slice(start, end)}; scope.classifySmallTalk = classifySmallTalk;`)(scope);

const acknowledgementCases = [
  "That's great!",
  "That’s great!",
  "that is great",
  "brilliant",
  "perfect",
  "nice one",
  "good to know",
  "makes sense",
  "that's helpful",
  "very helpful",
  "excellent",
  "amazing",
  "great thanks",
  "that's great thanks",
  "perfect thanks",
  "brilliant thanks",
  "thanks that's helpful",
  "okay thanks",
  "cool thanks"
];

for (const message of acknowledgementCases) {
  assert.equal(scope.classifySmallTalk(message), "acknowledgement", message);
}

assert.equal(scope.classifySmallTalk("thanks bye"), "farewell");
assert.equal(scope.classifySmallTalk("thanks"), "thanks");
assert.equal(scope.classifySmallTalk("hello"), "greeting");

const realFollowUps = [
  "That's great, can you compare Bristol and Swindon?",
  "Great, what about housing affordability in Cotswold?",
  "Perfect, can you show the source?",
  "Thanks, can you summarise the skills posts?",
  "Good, now give me the local authority breakdown."
];

for (const message of realFollowUps) {
  assert.equal(scope.classifySmallTalk(message), null, message);
}

console.log("Small-talk tests passed.");
