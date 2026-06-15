/**
 * High-order middleware to validate req.body against a Joi schema.
 * Strips unknown fields to protect against Parameter Pollution and mass-assignment.
 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false, // Return all validation errors
    stripUnknown: true // Strip unregistered fields for security
  });

  if (error) {
    return next(error);
  }

  req.body = value; // Replace req.body with sanitized and validated inputs
  next();
};

module.exports = validate;
