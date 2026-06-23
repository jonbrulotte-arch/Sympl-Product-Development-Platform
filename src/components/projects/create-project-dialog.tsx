"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { projectSchema, type ProjectInput } from "@/lib/validation";

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<ProjectInput>({ resolver: zodResolver(projectSchema) as any });

  async function onSubmit(data: ProjectInput) {
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const project = await res.json();
      reset();
      setOpen(false);
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New Project
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <Input {...register("name")} placeholder="e.g. Q1 Saw Blade Launch" />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <Textarea {...register("description")} placeholder="Brief description of this project" rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                <Input {...register("brand")} placeholder="e.g. Spyder" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Family</label>
                <Input {...register("productFamilyName")} placeholder="e.g. Rapid Core" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Retailer / Channel</label>
                <Input {...register("retailer")} placeholder="e.g. Home Depot" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Launch</label>
                <Input {...register("targetLaunchDate")} type="date" />
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
