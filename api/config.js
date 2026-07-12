export default function handler(_req, res) {
  res.json({
    defaultUser: process.env.DEFAULT_USER || 'anshaneja5',
    demo: !process.env.GITHUB_TOKEN,
  });
}
