export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { user } = req.body;
  if (!user) {
    res.status(400).json({ error: "Missing user" });
    return;
  }

  // Şimdilik sahte bir tx hash dönelim (mock)
  const fakeHash = "0x" + Math.random().toString(16).slice(2).padEnd(64, "0");

  res.status(200).json({
    txHash: fakeHash,
    sponsored: true,
    user,
  });
}
