// server/controller/agent_api_test.js
import { generateAgentToken } from "../service/jwt_service.js";

/**
 * Test endpoint to verify agent API configuration
 */
export const testAgentConfig = (req, res) => {
  try {
    // Get agent information
    const { agentId = "conf_ag" } = req.body;

    // Get JWT configuration
    const jwtIssuer =
      process.env[`${agentId.toUpperCase()}_JWT_ISSUER`] ||
      process.env.JWT_ISSUER ||
      "yana.bao+AIStudio+DG01@test.zoom.us";

    const jwtAudience =
      process.env[`${agentId.toUpperCase()}_JWT_AUDIENCE`] ||
      process.env.JWT_AUDIENCE ||
      "zoom_caic";

    const jwtAid =
      process.env[`${agentId.toUpperCase()}_JWT_AID`] ||
      process.env.JWT_AID ||
      "3v8eT3vkQ1-PBQnN61MJog";

    const jwtUid =
      process.env[`${agentId.toUpperCase()}_JWT_UID`] ||
      process.env.JWT_UID ||
      "NhiGO2feQEORV5Loghzx_Q";

    const secretKey =
      process.env[`${agentId.toUpperCase()}_JWT_SECRET`] ||
      process.env.JWT_SECRET_KEY ||
      "xh94swe59q03xi1felkuxdntkn5gd9zt";

    // Get API endpoint
    const apiBaseUrl =
      process.env.API_BASE_URL ||
      "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/tt6w7wNWQUOn5UBPCUi2mg";

    const endpoint =
      process.env[`${agentId.toUpperCase()}_API_URL`] ||
      `${apiBaseUrl}?skillSettingId=${agentId}`;

    // Generate a token for testing
    const token = generateAgentToken(agentId, secretKey);

    // Return configuration information
    res.status(200).json({
      success: true,
      config: {
        agentId,
        endpoint,
        jwt: {
          issuer: jwtIssuer,
          audience: jwtAudience,
          aid: jwtAid,
          uid: jwtUid,
          secretKey:
            secretKey.substring(0, 3) +
            "***" +
            secretKey.substring(secretKey.length - 3),
        },
        token:
          token.substring(0, 10) + "..." + token.substring(token.length - 10),
        proxyEndpoint: "/api/proxy-agent-poll",
      },
      message: "Configuration loaded successfully",
    });
  } catch (error) {
    console.error("Error testing agent config:", error);
    res.status(500).json({
      success: false,
      error:
        error.message || "An error occurred while testing agent configuration",
    });
  }
};
