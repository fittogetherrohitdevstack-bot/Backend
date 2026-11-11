const { z } = require("zod");

const validate = (schema) => (req, res, next) => {
  try {
    if (schema.body) {
      req.body = schema.body.parse(req.body || {});
    }
    if (schema.query) {
      req.validatedQuery = schema.query.parse(req.query || {});
    }
    if (schema.params) {
      req.validatedParams = schema.params.parse(req.params || {});
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      }));
      return res.status(400).json({
        success: false,
        message: "Input validation failed",
        errors: formattedErrors,
      });
    }
    next(error);
  }
};

module.exports = validate;
