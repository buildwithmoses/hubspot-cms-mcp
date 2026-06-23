import express from "express";
import axios, { AxiosInstance } from "axios";

// ─── Config ───────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error("Error: HUBSPOT_ACCESS_TOKEN environment variable is required");
  process.exit(1);
}

const MCP_API_KEY = process.env.MCP_API_KEY;
const PORT = Number(process.env.PORT ?? 3000);

// ─── HubSpot API client ───────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: "https://api.hubapi.com",
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
});

async function callApi(method: string, path: string, data?: unknown, params?: Record<string, unknown>) {
  const response = await api.request({ method, url: path, data, params });
  return response.data;
}

// ─── Tools definition ─────────────────────────────────────────────────────────

const TOOLS = [
  // ── Blog Posts ──────────────────────────────────────────────────────────────
  {
    name: "list_blog_posts",
    description: "List blog posts. Optionally filter by state or blog content group.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 10)" },
        after: { type: "string", description: "Pagination cursor" },
        state: { type: "string", enum: ["PUBLISHED", "DRAFT"] },
        contentGroupId: { type: "string", description: "Filter by blog ID" },
        orderBy: { type: "string", description: "Sort field e.g. '-publishDate'" },
      },
    },
  },
  {
    name: "get_blog_post",
    description: "Get a single blog post by ID.",
    inputSchema: { type: "object", required: ["postId"], properties: { postId: { type: "string" } } },
  },
  {
    name: "create_blog_post",
    description: "Create a new blog post (DRAFT by default).",
    inputSchema: {
      type: "object",
      required: ["contentGroupId", "name"],
      properties: {
        contentGroupId: { type: "string" },
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
    inputSchema: { type: "object", required: ["postId"], properties: { postId: { type: "string" } } },
  },
  // ── Blog Authors ────────────────────────────────────────────────────────────
  {
    name: "list_blog_authors",
    description: "List all blog authors.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" }, after: { type: "string" } },
    },
  },
  {
    name: "get_blog_author",
    description: "Get a single blog author by ID.",
    inputSchema: { type: "object", required: ["authorId"], properties: { authorId: { type: "string" } } },
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
        avatar: { type: "string" },
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
  // ── Blog Tags ───────────────────────────────────────────────────────────────
  {
    name: "list_blog_tags",
    description: "List all blog tags.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" }, after: { type: "string" } },
    },
  },
  {
    name: "get_blog_tag",
    description: "Get a blog tag by ID.",
    inputSchema: { type: "object", required: ["tagId"], properties: { tagId: { type: "string" } } },
  },
  {
    name: "create_blog_tag",
    description: "Create a new blog tag.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" }, slug: { type: "string" } },
    },
  },
  {
    name: "update_blog_tag",
    description: "Update a blog tag.",
    inputSchema: {
      type: "object",
      required: ["tagId"],
      properties: { tagId: { type: "string" }, name: { type: "string" }, slug: { type: "string" } },
    },
  },
  // ── Site Pages ──────────────────────────────────────────────────────────────
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
    description: "Get a site page by ID.",
    inputSchema: { type: "object", required: ["pageId"], properties: { pageId: { type: "string" } } },
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
    description: "Update a site page.",
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
  // ── Landing Pages ───────────────────────────────────────────────────────────
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
    description: "Get a landing page by ID.",
    inputSchema: { type: "object", required: ["pageId"], properties: { pageId: { type: "string" } } },
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
    description: "Update a landing page.",
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
  // ── Files ───────────────────────────────────────────────────────────────────
  {
    name: "list_files",
    description: "List files in the HubSpot file manager.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        after: { type: "string" },
        path: { type: "string" },
        type: { type: "string", description: "IMG, DOCUMENT, OTHER" },
        name: { type: "string", description: "Substring match on file name" },
      },
    },
  },
  {
    name: "get_file",
    description: "Get file metadata by ID.",
    inputSchema: { type: "object", required: ["fileId"], properties: { fileId: { type: "string" } } },
  },
  {
    name: "delete_file",
    description: "Delete a file from the HubSpot file manager.",
    inputSchema: { type: "object", required: ["fileId"], properties: { fileId: { type: "string" } } },
  },
];

// ─── Tool dispatch ────────────────────────────────────────────────────────────

async function dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    // Blog Posts
    case "list_blog_posts": {
      const p: Record<string, unknown> = { limit: args.limit ?? 10 };
      if (args.after) p.after = args.after;
      if (args.state) p.state = args.state;
      if (args.contentGroupId) p.contentGroupId = args.contentGroupId;
      if (args.orderBy) p.orderBy = args.orderBy;
      return callApi("GET", "/cms/v3/blogs/posts", undefined, p);
    }
    case "get_blog_post":
      return callApi("GET", `/cms/v3/blogs/posts/${args.postId}`);
    case "create_blog_post": {
      const body: Record<string, unknown> = { contentGroupId: args.contentGroupId, name: args.name, state: args.state ?? "DRAFT" };
      for (const f of ["postBody", "postSummary", "metaDescription", "htmlTitle", "slug", "authorName", "tagIds", "featuredImage", "publishDate"])
        if (args[f] !== undefined) body[f] = args[f];
      return callApi("POST", "/cms/v3/blogs/posts", body);
    }
    case "update_blog_post": {
      const { postId, ...fields } = args;
      return callApi("PATCH", `/cms/v3/blogs/posts/${postId}`, fields);
    }
    case "delete_blog_post":
      await callApi("DELETE", `/cms/v3/blogs/posts/${args.postId}`);
      return { success: true };

    // Blog Authors
    case "list_blog_authors": {
      const p: Record<string, unknown> = { limit: args.limit ?? 10 };
      if (args.after) p.after = args.after;
      return callApi("GET", "/cms/v3/blogs/authors", undefined, p);
    }
    case "get_blog_author":
      return callApi("GET", `/cms/v3/blogs/authors/${args.authorId}`);
    case "create_blog_author": {
      const body: Record<string, unknown> = { displayName: args.displayName };
      for (const f of ["email", "bio", "avatar", "website", "twitterUsername", "linkedinUrl"])
        if (args[f] !== undefined) body[f] = args[f];
      return callApi("POST", "/cms/v3/blogs/authors", body);
    }
    case "update_blog_author": {
      const { authorId, ...fields } = args;
      return callApi("PATCH", `/cms/v3/blogs/authors/${authorId}`, fields);
    }

    // Blog Tags
    case "list_blog_tags": {
      const p: Record<string, unknown> = { limit: args.limit ?? 10 };
      if (args.after) p.after = args.after;
      return callApi("GET", "/cms/v3/blogs/tags", undefined, p);
    }
    case "get_blog_tag":
      return callApi("GET", `/cms/v3/blogs/tags/${args.tagId}`);
    case "create_blog_tag":
      return callApi("POST", "/cms/v3/blogs/tags", { name: args.name, ...(args.slug ? { slug: args.slug } : {}) });
    case "update_blog_tag": {
      const { tagId, ...fields } = args;
      return callApi("PATCH", `/cms/v3/blogs/tags/${tagId}`, fields);
    }

    // Site Pages
    case "list_site_pages": {
      const p: Record<string, unknown> = { limit: args.limit ?? 10 };
      if (args.after) p.after = args.after;
      if (args.state) p.state = args.state;
      return callApi("GET", "/cms/v3/pages/site-pages", undefined, p);
    }
    case "get_site_page":
      return callApi("GET", `/cms/v3/pages/site-pages/${args.pageId}`);
    case "create_site_page": {
      const body: Record<string, unknown> = { name: args.name, slug: args.slug, state: args.state ?? "DRAFT" };
      for (const f of ["htmlTitle", "metaDescription", "templatePath"]) if (args[f] !== undefined) body[f] = args[f];
      return callApi("POST", "/cms/v3/pages/site-pages", body);
    }
    case "update_site_page": {
      const { pageId, ...fields } = args;
      return callApi("PATCH", `/cms/v3/pages/site-pages/${pageId}`, fields);
    }

    // Landing Pages
    case "list_landing_pages": {
      const p: Record<string, unknown> = { limit: args.limit ?? 10 };
      if (args.after) p.after = args.after;
      if (args.state) p.state = args.state;
      return callApi("GET", "/cms/v3/pages/landing-pages", undefined, p);
    }
    case "get_landing_page":
      return callApi("GET", `/cms/v3/pages/landing-pages/${args.pageId}`);
    case "create_landing_page": {
      const body: Record<string, unknown> = { name: args.name, slug: args.slug, state: args.state ?? "DRAFT" };
      for (const f of ["htmlTitle", "metaDescription", "templatePath"]) if (args[f] !== undefined) body[f] = args[f];
      return callApi("POST", "/cms/v3/pages/landing-pages", body);
    }
    case "update_landing_page": {
      const { pageId, ...fields } = args;
      return callApi("PATCH", `/cms/v3/pages/landing-pages/${pageId}`, fields);
    }

    // Files
    case "list_files": {
      const p: Record<string, unknown> = { limit: args.limit ?? 10 };
      if (args.after) p.after = args.after;
      if (args.path) p.path = args.path;
      if (args.type) p.type = args.type;
      if (args.name) p.name__icontains = args.name;
      return callApi("GET", "/files/v3/files", undefined, p);
    }
    case "get_file":
      return callApi("GET", `/files/v3/files/${args.fileId}`);
    case "delete_file":
      await callApi("DELETE", `/files/v3/files/${args.fileId}`);
      return { success: true };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Express HTTP server ──────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Auth middleware
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!MCP_API_KEY || req.path === "/health") { next(); return; }
  const auth = req.headers.authorization ?? "";
  const key = req.query.api_key as string | undefined;
  if (auth === `Bearer ${MCP_API_KEY}` || key === MCP_API_KEY) { next(); return; }
  res.status(401).json({ error: "Unauthorized" });
});

// Health check
app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({ status: "ok", server: "hubspot-cms-mcp", tools: TOOLS.length });
});

// ── Stateless JSON-RPC over HTTP (POST /sse — used by Airops & modern clients)
app.post("/sse", async (req: express.Request, res: express.Response) => {
  const { method, params, id } = req.body ?? {};

  const ok = (result: unknown) => res.json({ jsonrpc: "2.0", id: id ?? null, result });
  const err = (code: number, message: string) => res.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

  try {
    switch (method) {
      case "initialize":
        return ok({
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "hubspot-cms", version: "1.0.0" },
        });

      case "notifications/initialized":
      case "ping":
        return res.status(202).end();

      case "tools/list":
        return ok({ tools: TOOLS });

      case "tools/call": {
        const { name, arguments: toolArgs = {} } = params ?? {};
        const data = await dispatchTool(name, toolArgs as Record<string, unknown>);
        return ok({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      }

      default:
        return err(-32601, `Method not found: ${method}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(-32000, msg);
  }
});

process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

app.listen(PORT, () => {
  console.log(`HubSpot CMS MCP server listening on port ${PORT}`);
});
