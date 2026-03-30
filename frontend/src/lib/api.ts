import axios from "axios";

const apiBaseURL =
  process.env.NEXT_PUBLIC_BITMAGNET_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3333";

interface GraphQLError {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>) {
  const response = await axios.post<GraphQLResponse<T>>(
    `${apiBaseURL}/graphql`,
    { query, variables },
    { timeout: 15000 }
  );

  if (response.data.errors?.length) {
    throw new Error(response.data.errors.map((e) => e.message).join("; "));
  }

  if (!response.data.data) {
    throw new Error("GraphQL response did not include data.");
  }

  return response.data.data;
}

export { apiBaseURL };
