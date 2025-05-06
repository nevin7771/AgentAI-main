// server/config/agentConfig.js
// Configuration for different agent endpoints and secrets

/**
 * Agent configuration for different types of agents
 * Each agent has its own endpoint and authentication details
 */
export const agentConfig = {
  // Client Agent configuration
  MRlQT_lhFw: {
    baseUrl:
      "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw/MRlQT_lhFw",
    secretKey: "gzazjvdts768lelcbcyy5ecpkiguthmq",
    jwkIssuer: "yana.bao+AIStudio+DG01@test.zoom.us",
    jwkAudience: "zoom_caic",
    jwkAid: "3v8eT3vkQ1-PBQnN61MJog",
    jwkUid: "NhiGO2feQEORV5Loghzx_Q",
  },
  // ZR Agent configuration
  zr_ag: {
    baseUrl:
      "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw/zr_ag",
    secretKey: "gzazjvdts768lelcbcyy5ecpkiguthmq",
    jwkIssuer: "yana.bao+AIStudio+DG01@test.zoom.us",
    jwkAudience: "zoom_caic",
    jwkAid: "3v8eT3vkQ1-PBQnN61MJog",
    jwkUid: "NhiGO2feQEORV5Loghzx_Q",
  },
  // Jira Agent configuration
  jira_ag: {
    baseUrl:
      "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/tt6w7wNWQUOn5UBPCUi2mg/jira_ag",
    secretKey: "xh94swe59q03xi1felkuxdntkn5gd9zt",
    jwkIssuer: "yana.bao+AIStudio+DG01@test.zoom.us",
    jwkAudience: "zoom_caic",
    jwkAid: "3v8eT3vkQ1-PBQnN61MJog",
    jwkUid: "NhiGO2feQEORV5Loghzx_Q",
  },
  // Confluence Agent configuration
  conf_ag: {
    baseUrl:
      "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw/conf_ag",
    secretKey: "gzazjvdts768lelcbcyy5ecpkiguthmq",
    jwkIssuer: "yana.bao+AIStudio+DG01@test.zoom.us",
    jwkAudience: "zoom_caic",
    jwkAid: "3v8eT3vkQ1-PBQnN61MJog",
    jwkUid: "NhiGO2feQEORV5Loghzx_Q",
  },
  // ZP Agent configuration
  zp_ag: {
    baseUrl:
      "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw/zp_ag",
    secretKey: "gzazjvdts768lelcbcyy5ecpkiguthmq",
    jwkIssuer: "yana.bao+AIStudio+DG01@test.zoom.us",
    jwkAudience: "zoom_caic",
    jwkAid: "3v8eT3vkQ1-PBQnN61MJog",
    jwkUid: "NhiGO2feQEORV5Loghzx_Q",
  },
  // Default configuration (fallback)
  default: {
    baseUrl:
      "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw",
    secretKey: "gzazjvdts768lelcbcyy5ecpkiguthmq",
    jwkIssuer: "yana.bao+AIStudio+DG01@test.zoom.us",
    jwkAudience: "zoom_caic",
    jwkAid: "3v8eT3vkQ1-PBQnN61MJog",
    jwkUid: "NhiGO2feQEORV5Loghzx_Q",
  },
};

/**
 * Get configuration for a specific agent
 * @param {string} agentId - The ID of the agent
 * @returns {Object} The agent configuration
 */
export const getAgentConfig = (agentId) => {
  return agentConfig[agentId] || agentConfig.default;
};

export default {
  agentConfig,
  getAgentConfig,
};
