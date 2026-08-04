export const DEMO_ACCOUNTS = [
  { role: "Administrator", email: "admin@demo.com" },
  { role: "Requester", email: "requester@demo.com" },
  { role: "Approver", email: "approver@demo.com" },
  { role: "Buyer", email: "buyer@demo.com" },
  { role: "Stores Incharge", email: "stores@demo.com" },
  { role: "AP Accountant", email: "ap@demo.com" },
  { role: "Finance Controller", email: "finance@demo.com" },
];

export const DEMO_EMAILS = new Set(DEMO_ACCOUNTS.map((a) => a.email));
