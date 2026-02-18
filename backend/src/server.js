require("dotenv").config();

const { createApp } = require("./app");

const app = createApp();
const port = Number(process.env.PORT || 3000);

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});

async function gracefulShutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received. Shutting down.`);

  if (app.locals.prisma) {
    await app.locals.prisma.$disconnect();
  }

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
