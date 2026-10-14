export async function onRequestGet(context) {
  try {
    const result = await context.env.DB
      .prepare("SELECT COUNT(*) AS total FROM users")
      .first();

    return Response.json({
      status: "ok",
      database: "jf-informatica-auth",
      table: "users",
      users: result.total
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error.message
      },
      { status: 500 }
    );
  }
}
