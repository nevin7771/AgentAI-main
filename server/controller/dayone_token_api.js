import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Get the existing Day One JWT token from environment
 * This does NOT regenerate the token - only returns what's in .env
 */
export const getDayOneToken = async (req, res) => {
  try {
    // Get token from environment
    const token = process.env.DAYONE_JWT_TOKEN;

    if (!token) {
      return res.status(404).json({
        success: false,
        error: "No Day One token found in environment",
        message:
          "Please generate a token first using the token generator script",
      });
    }

    console.log("[DayOneTokenAPI] Providing existing token to client");

    // Return the token to the client
    return res.status(200).json({
      success: true,
      token,
      message: "Retrieved existing Day One token",
    });
  } catch (error) {
    console.error("[DayOneTokenAPI] Error retrieving Day One token:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to retrieve Day One token",
    });
  }
};
