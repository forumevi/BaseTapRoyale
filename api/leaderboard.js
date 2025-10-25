export default async function handler(req, res) {
  const leaderboard = [
    { user: "0xAAA...1111", total: 128 },
    { user: "0xBBB...2222", total: 96 },
    { user: "0xCCC...3333", total: 75 },
  ];

  res.status(200).json({ top: leaderboard });
}
