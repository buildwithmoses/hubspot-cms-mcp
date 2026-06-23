import express from "express";
import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";

// ─── Config ───────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error("Error: HUBSPOT_ACCESS_TOKEN environment variable is required");
  process.exit(1);
}

const MCP_API_KEY = process.env.MCP_API_KEY; // optional auth guard
const PORT = Number(process.env.PORT ?? 3000);

// ─── HubSpot client ───────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: "https://api.hubapi.com",
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
});

async function callApi(method: string, path: string, data?: unknown, params?: Record<string, unknown>) {
  try {
    const response = await api.request({ method, url: path, data, params });
    return response.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string }; status?: number }; message?: string };
    const msg = error.response?.data?.message ?? error.message ?? "Unknown error";
    const status = error.response?.status ?? 500;
    throw new McpError(ErrorCode.InternalError, `HubSpot API error (${status}): ${msg}`);
  }
}

// ─── MCP server factory ───────────────────────────────────────────────────────
// Each SSE connection gets its own Server instance.

function createMcpServer(): Server {
  const server = new Server(
    { name: "hubspot-cms", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // ── Tool list ──────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // ── Blog Posts ──────────────────────────────────────────────────────
      {
        name: "list_blog_posts",
        description: "List blog posts. Optionally filter by state or blog content group.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max results (default 10, max 100)" },
            after: { type: "string", description: "Pagination cursor from previous response" },
            state: { type: "string", enum: ["PUBLISHED", "DRAFT"], description: "Filter by publish state" },
            contentGroupId: { type: "string", description: "Filter by blog ID" },
            orderBy: { type: "string", description: "Sort field, e.g. 'publishDate' or '-publishDate'" },
          },
        },
      },
      {
        name: "get_blog_post",
        description: "Get a single blog post by ID.",
        inputSchema: {
          type: "object",
          required: ["postId"],
          properties: { postId: { type: "string" } },
        },
      },
      {
        name: "create_blog_post",
        description: "Create a new blog post (DRAFT by default).",
        inputSchema: {
          type: "object",
          required: ["contentGroupId", "name"],
          properties: {
            contentGroupId: { type: "string", description: "Blog ID to publish to" },
            name: { type: "string", description: "Post title" },
            postBody: { type: "string", description: "HTML body" },
            postSummary: { type: "string", description: "Short excerpt" },
            metaDescription: { type: "string" },
            htmlTitle: { type: "string", description: "SEO <title> tag" },
            slug: { type: "string" },
            authorName: { type: "string" },
            tagIds: { type: "array", items: { type: "string" } },
            featuredImage: { type: "string", description: "URL of featured image" },
            publishDate: { type: "string", description: "ISO 8601 publish date" },
            state: { type: "string", enum: ["PUBLISHED", "DRAFT"] },
          },
        },
      },
      {
        name: "update_blog_post",
        description: "Update an existing blog post. Only supply fields to change.",
        inputSchema: {
          type: "object",
          required: ["postId"],
          properties: {
            postId: { type: "string" },
            name: { type: "string" },
            postBody: { type: "string" },
            postSummary: { type: "string" },
            metaDescription: { type: "string" },
            htmlTitle: { type: "string" },
            slug: { type: "string" },
            authorName: { type: "string" },
            tagIds: { type: "array", items: { type: "string" } },
            featuredImage: { type: "string" },
            publishDate: { type: "string" },
            state: { type: "string", enum: ["PUBLISHED", "DRAFT"] },
          },
        },
      },
      {
        name: "delete_blog_post",
        description: "Archive (soft-delete) a blog post.",
        inputSchema: {
          type: "object",
          required: ["postId"],
          properties: { postId: { type: "string" } },
        },
      },

      // ── Blog Authors ──────────────────────────────────────────────────────
      {
        name: "list_blog_authors",
        description: "List all blog authors.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number" },
            after: { type: "string" },
          },
        },
      },
      {
        name: "get_blog_author",
        description: "Get a single blog author by ID.",
        inputSchema: {
          type: "object",
          required: ["authorId"],
          properties: { authorId: { type: "string" } },
        },
      },
      {
        name: "create_blog_author",
        description: "Create a new blog author.",
        inputSchema: {
          type: "object",
          required: ["displayName"],
          properties: {
            displayName: { type: "string" },
            email: { type: "string" },
            bio: { type: "string" },
            avatar: { type: "string", description: "URL of avatar image" },
            website: { type: "string" },
            twitterUsername: { type: "string" },
            linkedinUrl: { type: "string" },
          },
        },
      },
      {
        name: "update_blog_author",
        description: "Update an existing blog author.",
        inputSchema: {
          type: "object",
          required: ["authorId"],
          properties: {
            authorId: { type: "string" },
            displayName: { type: "string" },
            email: { type: "string" },
            bio: { type: "string" },
            avatar: { type: "string" },
            website: { type: "string" },
            twitterUsername: { type: "string" },
            linkedinUrl: { type: "string" },
          },
        },
      },

      // ── Blog Tags ─────────────────────────────────────────────────────────
      {
        name: "list_blog_tags",
        description: "List all blog tags.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number" },
            after: { type: "string" },
          },
        },
      },
      {
        name: "get_blog_tag",
        description: "Get a single blog tag by ID.",
        inputSchema: {
          type: "object",
          required: ["tagId"],
          properties: { tagId: { type: "string" } },
        },
      },
      {
        name: "create_blog_tag",
        description: "Create a new blog tag.",
        inputSchema: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            slug: { type: "string" },
          },
        },
      },
      {
        name: "update_blog_tag",
        description: "Update an existing blog tag.",
        inputSchema: {
          type: "object",
          required: ["tagId"],
          properties: {
            tagId: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
          },
        },
      },

      // ── Site Pages ────────────────────────────────────────────────────────
      {
        name: "list_site_pages",
        description: "List site pages.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number" },
            after: { type: "string" },
            state: { type: "string", enum: ["PUBLISHED", "DRAFT"] },
          },
        },
      },
      {
        name: "get_site_page",
        description: "Get a single site page by ID.",
        inputSchema: {
          type: "object",
          required: ["pageId"],
          properties: { pageId: { type: "string" } },
        },
      },
      {
        name: "create_site_page",
        description: "Create a new site page.",
        inputSchema: {
          type: "object",
          required: ["name", "slug"],
          properties: {
            name: { type: "string" },
            htmlTitle: { type: "string" },
            slug: { type: "string" },
            metaDescription: { type: "string" },
            state: { type: "string", enum: ["PUBLISHED", "DRAFT"] },
            templatePath: { type: "string" },
          },
        },
      },
      {
        name: "update_site_page",
        description: "Update an existing site page.",
        inputSchema: {
          type: "object",
          required: ["pageId"],
          properties: {
            pageId: { type: "string" },
            name: { type: "string" },
            htmlTitle: { type: "string" },
            slug: { type: "string" },
            metaDescription: { type: "string" },
            state: { type: "string", enum: ["PUBLISHED", "DRAFT"] },
          },
        },
      },

      // ── Landing Pages ─────────────────────────────────────────────────────
      {
        name: "list_landing_pages",
        description: "List landing pages.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number" },
            after: { type: "string" },
            state: { type: "string", enum: ["PUBLISHED", "DRAFT"] },
          },
        },
      },
      {
        name: "get_landing_page",
        description: "Get a single landing page by ID.",
        inputSchema: {
          type: "object",
          required: ["pageId"],
          properties: { pageId: { type: "string" } },
        },
      },
      {
        name: "create_landing_page",
        description: "Create a new landing page.",
        inputSchema: {
          type: "object",
          required: ["name", "slug"],
          properties: {
            name: { type: "string" },
            htmlTitle: { type: "string" },
            slug: { type: "string" },
            metaDescription: { type: "string" },
            state: { type: "string", enum: ["PUBLISHED", "DRAFT"] },
            templatePath: { type: "string" },
          },
        },
      },
      {
        name: "update_landing_page",
        description: "Update an existing landing page.",
        inputSchema: {
          type: "object",
          required: ["pageId"],
          properties: {
            pageId: { type: "string" },
            name: { type: "string" },
            htmlTitle: { type: "string" },
            slug: { type: "string" },
            metaDescription: { type: "string" },
            state: { type: "string", enum: ["PUBLISHED", "DRAFT"] },
          },
        },
      },

      // ── Files ─────────────────────────────────────────────────────────────
      {
        name: "list_files",
        description: "List files in the HubSpot file manager.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number" },
            after: { type: "string" },
            path: { type: "string", description: "Filter by folder path" },
            type: { type: "string", description: "Filter by type: IMG, DOCUMENT, OTHER" },
            name: { type: "string", description: "Substring match on file name" },
          },
        },
      },
      {
        name: "get_file",
        description: "Get metadata for a file by ID.",
        inputSchema: {
          type: "object",
          required: ["fileId"],
          properties: { fileId: { type: "string" } },
        },
      },
      {
        name: "delete_file",
        description: "Delete a file from the HubSpot file manager.",
        inputSchema: {
          type: "object",
          required: ["fileId"],
          properties: { fileId: { type: "string" } },
        },
      },
    ],
  }));

  // ── Tool handlers ──────────────────────────────────────────────────────────

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    const text = (data: unknown) => ({
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    });

    switch (name) {
      // ── Blog Posts ────────────────────────────────────────────────────────

      case "list_blog_posts": {
        const params: Record<string, unknown> = { limit: args.limit ?? 10 };
        if (args.after) params.after = args.after;
        if (args.state) params.state = args.state;
        if (args.contentGroupId) params.contentGroupId = args.contentGroupId;
        if (args.orderBy) params.orderBy = args.orderBy;
        return text(await callApi("GET", "/cms/v3/blogs/posts", undefined, params));
      }

      case "get_blog_post":
        return text(await callApi("GET", `/cms/v3/blogs/posts/${args.postId}`));

      case "create_blog_post": {
        const body: Record<string, unknown> = {
          contentGroupId: args.contentGroupId,
          name: args.name,
          state: args.state ?? "DRAFT",
        };
        for (const f of ["postBody", "postSummary", "metaDescription", "htmlTitle", "slug",
          "authorName", "tagIds", "featuredImage", "publishDate"]) {
          if (args[f] !== undefined) body[f] = args[f];
        }
        return text(await callApi("POST", "/cms/v3/blogs/posts", body));
      }

      case "update_blog_post": {
        const { postId, ...fields } = args as Record<string, unknown>;
        return text(await callApi("PATCH", `/cms/v3/blogs/posts/${postId}`, fields));
      }

      case "delete_blog_post":
        await callApi("DELETE", `/cms/v3/blogs/posts/${args.postId}`);
        return text({ success: true, message: `Post ${args.postId} archived.` });

      // ── Blog Authors ──────────────────────────────────────────────────────

      case "list_blog_authors": {
        const params: Record<string, unknown> = { limit: args.limit ?? 10 };
        if (args.after) params.after = args.after;
        return text(await callApi("GET", "/cms/v3/blogs/authors", undefined, params));
      }

      case "get_blog_author":
        return text(await callApi("GET", `/cms/v3/blogs/authors/${args.authorId}`));

      case "create_blog_author": {
        const body: Record<string, unknown> = { displayName: args.displayName };
        for (const f of ["email", "bio", "avatar", "website", "twitterUsername", "linkedinUrl"]) {
          if (args[f] !== undefined) body[f] = args[f];
        }
        return text(await callApi("POST", "/cms/v3/blogs/authors", body));
      }

      case "update_blog_author": {
        const { authorId, ...fields } = args as Record<string, unknown>;
        return text(await callApi("PATCH", `/cms/v3/blogs/authors/${authorId}`, fields));
      }

      // ── Blog Tags ─────────────────────────────────────────────────────────

      case "list_blog_tags": {
        const params: Record<string, unknown> = { limit: args.limit ?? 10 };
        if (args.after) params.after = args.after;
        return text(await callApi("GET", "/cms/v3/blogs/tags", undefined, params));
      }

      case "get_blog_tag":
        return text(await callApi("GET", `/cms/v3/blogs/tags/${args.tagId}`));

      case "create_blog_tag": {
        const body: Record<string, unknown> = { name: args.name };
        if (args.slug) body.slug = args.slug;
        return text(await callApi("POST", "/cms/v3/blogs/tags", body));
      }

      case "update_blog_tag": {
        const { tagId, ...fields } = args as Record<string, unknown>;
        return text(await callApi("PATCH", `/cms/v3/blogs/tags/${tagId}`, fields));
      }

      // ── Site Pages ────────────────────────────────────────────────────────

      case "list_site_pages": {
        const params: Record<string, unknown> = { limit: args.limit ?? 10 };
        if (args.after) params.after = args.after;
        if (args.state) params.state = args.state;
        return text(await callApi("GET", "/cms/v3/pages/site-pages", undefined, params));
      }

      case "get_site_page":
        return text(await callApi("GET", `/cms/v3/pages/site-pages/${args.pageId}`));

      case "create_site_page": {
        const body: Record<string, unknown> = {
          name: args.name,
          slug: args.slug,
          state: args.state ?? "DRAFT",
        };
        for (const f of ["htmlTitle", "metaDescription", "templatePath"]) {
          if (args[f] !== undefined) body[f] = args[f];
        }
        return text(await callApi("POST", "/cms/v3/pages/site-pages", body));
      }

      case "update_site_page": {
        const { pageId, ...fields } = args as Record<string, unknown>;
        return text(await callApi("PATCH", `/cms/v3/pages/site-pages/${pageId}`, fields));
      }

      // ── Landing Pages ─────────────────────────────────────────────────────

      case "list_landing_pages": {
        const params: Record<string, unknown> = { limit: args.limit ?? 10 };
        if (args.after) params.after = args.after;
        if (args.state) params.state = args.state;
        return text(await callApi("GET", "/cms/v3/pages/landing-pages", undefined, params));
      }

      case "get_landing_page":
        return text(await callApi("GET", `/cms/v3/pages/landing-pages/${args.pageId}`));

      case "create_landing_page": {
        const body: Record<string, unknown> = {
          name: args.name,
          slug: args.slug,
          state: args.state ?? "DRAFT",
        };
        for (const f of ["htmlTitle", "metaDescription", "templatePath"]) {
          if (args[f] !== undefined) body[f] = args[f];
        }
        return text(await callApi("POST", "/cms/v3/pages/landing-pages", body));
      }

      case "update_landing_page": {
        const { pageId, ...fields } = args as Record<string, unknown>;
        return text(await callApi("PATCH", `/cms/v3/pages/landing-pages/${pageId}`, fields));
      }

      // ── Files ─────────────────────────────────────────────────────────────

      case "list_files": {
        const params: Record<string, unknown> = { limit: args.limit ?? 10 };
        if (args.after) params.after = args.after;
        if (args.path) params.path = args.path;
        if (args.type) params.type = args.type;
        if (args.name) params.name__icontains = args.name;
        return text(await callApi("GET", "/files/v3/files", undefined, params));
      }

      case "get_file":
        return text(await callApi("GET", `/files/v3/files/${args.fileId}`));

      case "delete_file":
        await callApi("DELETE", `/files/v3/files/${args.fileId}`);
        return text({ success: true, message: `File ${args.fileId} deleted.` });

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  });

  return server;
}

// ─── Express HTTP server ──────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Auth middleware (only if MCP_API_KEY is set)
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!MCP_API_KEY || req.path === "/health") { next(); return; }
  const auth = req.headers.authorization ?? "";
  const key = req.query.api_key as string | undefined;
  if (auth === `Bearer ${MCP_API_KEY}` || key === MCP_API_KEY) { next(); return; }
  res.status(401).json({ error: "Unauthorized" });
});

// Health check
app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({ status: "ok", server: "hubspot-cms-mcp" });
});

// ── StreamableHTTP transport (POST /sse — used by Airops and modern clients) ─
const streamableTransports = new Map<string, StreamableHTTPServerTransport>();

app.post("/sse", async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? streamableTransports.get(sessionId) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
      if (transport.sessionId) {
        streamableTransports.set(transport.sessionId, transport);
        transport.onclose = () => streamableTransports.delete(transport!.sessionId!);
      }
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("StreamableHTTP error:", err);
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
});

// ── Legacy SSE transport (GET /sse — for older clients) ───────────────────
const sseTransports = new Map<string, SSEServerTransport>();

app.get("/sse", async (req: express.Request, res: express.Response) => {
  try {
    const transport = new SSEServerTransport("/messages", res);
    sseTransports.set(transport.sessionId, transport);
    res.on("close", () => sseTransports.delete(transport.sessionId));
    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
  } catch (err) {
    console.error("SSE error:", err);
    if (!res.headersSent) res.status(500).end();
  }
});

// Message endpoint — client POSTs tool calls here, passing req.body so the
// SDK does not need to re-read the already-consumed request stream.
app.post("/messages", async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.query.sessionId as string;
    const transport = sseTransports.get(sessionId);
    if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
    await transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    console.error("SSE message error:", err);
    if (!res.headersSent) res.status(500).end();
  }
});

process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

app.listen(PORT, () => {
  console.log(`HubSpot CMS MCP server listening on port ${PORT}`);
});
