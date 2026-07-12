export default function handler(_req, res) {
  res.json({
    defaultUser: process.env.DEFAULT_USER || 'torvalds',
    demo: !process.env.GITHUB_TOKEN,
  });
}
