import api, { route } from "@forge/api";

export const issueResolver = {
  getContext: async () => {
    return context.getContext();
  },

  getIssue: async (payload) => {
    const { issueId } = payload;
    const response = await api
      .asUser()
      .requestJira(route`/rest/api/3/issue/${issueId}`);
    const data = await response.json();
    return data;
  },
};
