import type {
  User,
  Project,
  ProductRecord,
  Category,
  AttributeDefinition,
  LovItem,
  WorkflowStage,
  Comment,
  ActivityLog,
  ProjectMember,
  ProductAttributeValue,
  ImportHistory,
  UserRole,
  ProjectStatus,
  AttributeType,
  FieldRequirement,
  WorkflowStageStatus,
} from "@prisma/client";

export type {
  UserRole,
  ProjectStatus,
  AttributeType,
  FieldRequirement,
  WorkflowStageStatus,
};

export type SafeUser = Omit<User, "passwordHash">;

export type ProjectWithRelations = Project & {
  owner: SafeUser;
  members: (ProjectMember & { user: SafeUser })[];
  _count: { products: number };
  category: Category | null;
  workflowStages?: WorkflowStageWithApprovals[];
};

export type ProductWithAttributes = ProductRecord & {
  attributeValues: (ProductAttributeValue & {
    attributeDefinition: AttributeDefinition;
  })[];
  category: Category | null;
  createdBy: SafeUser;
  updatedBy: SafeUser | null;
};

export type AttributeWithLov = AttributeDefinition & {
  lovItems: LovItem[];
};

export type CategoryWithAttributes = Category & {
  attributes: AttributeWithLov[];
  children: Category[];
};

export type WorkflowStageWithApprovals = WorkflowStage & {
  approvals: {
    id: string;
    approverId: string;
    status: WorkflowStageStatus;
    comments: string | null;
    reviewedAt: Date | null;
    approver: SafeUser;
  }[];
};

export type CommentWithAuthor = Comment & {
  author: SafeUser;
  replies: (Comment & { author: SafeUser })[];
};

export type ActivityLogWithUser = ActivityLog & {
  user: SafeUser;
};

export type ImportHistoryWithUser = ImportHistory & {
  user: SafeUser;
};

// Grid cell types
export type CellSaveStatus = "idle" | "saving" | "saved" | "error";

export type GridColumn = {
  key: string;
  label: string;
  section?: string;
  width?: number;
  pinned?: boolean;
  hidden?: boolean;
  editable?: boolean;
  required?: boolean;
  type?: AttributeType | "text" | "number" | "boolean" | "select";
  lovItems?: { value: string; label: string }[];
};

// API response shapes
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// Column mapping for import
export type ColumnMapping = {
  sourceColumn: string;
  targetField: string | null;
  sampleValues: string[];
};

export type ImportPreview = {
  fileName: string;
  sheets: string[];
  selectedSheet: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
  columnMappings: ColumnMapping[];
};

export type ValidationResult = {
  rowIndex: number;
  partNumber: string;
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
  isValid: boolean;
};
