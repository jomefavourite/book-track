"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Copy,
  ImagePlus,
  Infinity,
  LinkIcon,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";

type Role = "owner" | "admin" | "moderator" | "member";

type CommunityDetail = {
  _id: Id<"communities">;
  name: string;
  slug: string;
  description?: string;
  visibility: "public" | "private";
  brandColor?: string;
  logoUrl?: string | null;
  viewerRole?: Role;
};

type Member = {
  _id: Id<"communityMembers">;
  name?: string;
  email?: string;
  clerkId: string;
  role: Role;
};

type Invite = {
  _id: Id<"communityInvites">;
  token: string;
  roleToGrant: Exclude<Role, "owner">;
  expiresAt?: number;
  maxUses?: number;
  usedCount: number;
  disabledAt?: number;
  createdAt: number;
};

function canManage(role?: Role) {
  return role === "owner" || role === "admin";
}

function buildInviteUrl(token: string) {
  if (typeof window === "undefined") return `/join/${token}`;
  return `${window.location.origin}/join/${token}`;
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function safeBrandColor(value: string) {
  return isHexColor(value) ? value : "#2460e0";
}

function formatInviteDate(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function getInviteState(invite: Invite) {
  const now = Date.now();
  const isExpired = invite.expiresAt !== undefined && invite.expiresAt < now;
  const isUsedUp =
    invite.maxUses !== undefined && invite.usedCount >= invite.maxUses;
  const isRevoked = invite.disabledAt !== undefined;

  return {
    inactive: isRevoked || isExpired || isUsedUp,
    isExpired,
    isRevoked,
    isUsedUp,
  };
}

function getInviteExpiryText(invite: Invite) {
  if (invite.expiresAt === undefined) return "Never expires";
  const { isExpired } = getInviteState(invite);
  return `${isExpired ? "Expired" : "Expires"} ${formatInviteDate(invite.expiresAt)}`;
}

function getInviteUsageText(invite: Invite) {
  if (invite.maxUses === undefined) {
    return `${invite.usedCount.toLocaleString()} used · Unlimited uses`;
  }
  return `${invite.usedCount.toLocaleString()}/${invite.maxUses.toLocaleString()} used`;
}

function LogoUploader({
  communityId,
  logoUrl,
  communityName,
  onUploaded,
}: {
  communityId: Id<"communities">;
  logoUrl?: string | null;
  communityName: string;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const generateUploadUrl = useConvexMutation(api.communities.generateUploadUrl);
  const saveCommunityLogo = useConvexMutation(api.communities.saveCommunityLogo);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = await response.json();
      await saveCommunityLogo({ communityId, storageId });
      onUploaded();
      toast({
        title: "Logo updated",
        description: "Your community logo has been saved.",
      });
    } catch {
      toast({ title: "Logo upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`${communityName} logo`}
          className="h-16 w-16 rounded-lg border border-border object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
          <ImagePlus className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading..." : logoUrl ? "Change logo" : "Upload logo"}
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          Square images look best. Shown on the community and invite pages.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
    </div>
  );
}

function BrandColorInput({ defaultColor }: { defaultColor?: string }) {
  const [color, setColor] = useState(safeBrandColor(defaultColor ?? "#2460e0"));

  return (
    <div className="flex items-center gap-2">
      <Input
        type="color"
        value={safeBrandColor(color)}
        onChange={(event) => setColor(event.target.value)}
        aria-label="Choose brand color"
        className="h-10 w-14 shrink-0 cursor-pointer p-1"
      />
      <Input
        name="brandColor"
        value={color}
        onChange={(event) => setColor(event.target.value)}
        placeholder="#2460e0"
        pattern="#[0-9a-fA-F]{6}"
        maxLength={7}
      />
    </div>
  );
}

export default function CommunitySettingsPageClient() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const queryClient = useQueryClient();
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleToGrant, setRoleToGrant] = useState<"admin" | "moderator" | "member">("member");
  const [expirationMode, setExpirationMode] = useState<"limited" | "unlimited">("limited");
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [usageMode, setUsageMode] = useState<"limited" | "unlimited">("limited");
  const [maxUses, setMaxUses] = useState("1");
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<Invite | null>(null);

  const { data: community, isPending } = useQuery({
    ...convexQuery(api.communities.getCommunityBySlug, { slug }),
    enabled: !!slug,
  });

  const detail = community as CommunityDetail | null | undefined;
  const canEdit = canManage(detail?.viewerRole);
  const settingsCommunityId = detail?._id;
  const canLoadSettingsData = !!settingsCommunityId && canEdit;

  const memberQuery = useQuery(
    convexQuery(
      api.communities.listCommunityMembers,
      canLoadSettingsData ? { communityId: settingsCommunityId } : "skip"
    )
  );

  const inviteQuery = useQuery(
    convexQuery(
      api.communities.listInvites,
      canLoadSettingsData ? { communityId: settingsCommunityId } : "skip"
    )
  );

  const invalidateCommunity = () => {
    queryClient.invalidateQueries({
      queryKey: convexQuery(api.communities.getCommunityBySlug, { slug }).queryKey,
    });
    queryClient.invalidateQueries({
      queryKey: convexQuery(api.communities.discoverCommunities, {}).queryKey,
    });
    queryClient.invalidateQueries({
      queryKey: convexQuery(api.communities.getMyCommunities, {}).queryKey,
    });
    if (detail?._id) {
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.listCommunityMembers, {
          communityId: detail._id,
        }).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.listInvites, {
          communityId: detail._id,
        }).queryKey,
      });
    }
  };

  const { mutateAsync: updateCommunity, isPending: updatePending } = useMutation({
    mutationFn: useConvexMutation(api.communities.updateCommunity),
    onSuccess: invalidateCommunity,
  });

  const { mutateAsync: createInvite, isPending: invitePending } = useMutation({
    mutationFn: useConvexMutation(api.communities.createInvite),
    onSuccess: invalidateCommunity,
  });

  const { mutateAsync: disableInvite, isPending: disableInvitePending } = useMutation({
    mutationFn: useConvexMutation(api.communities.disableInvite),
    onSuccess: invalidateCommunity,
  });

  const { mutateAsync: updateMemberRole } = useMutation({
    mutationFn: useConvexMutation(api.communities.updateMemberRole),
    onSuccess: invalidateCommunity,
  });

  const { mutateAsync: removeMember, isPending: removeMemberPending } = useMutation({
    mutationFn: useConvexMutation(api.communities.removeMember),
    onSuccess: invalidateCommunity,
  });

  const activeInvites = useMemo(
    () => ((inviteQuery.data as Invite[] | undefined) ?? []),
    [inviteQuery.data]
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || isSaving) return;
    setIsSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    const name = String(formData.get("name") ?? "");
    const description = String(formData.get("description") ?? "");
    const visibility = String(formData.get("visibility") ?? "private") as
      | "public"
      | "private";
    const brandColor = String(formData.get("brandColor") ?? "");
    try {
      await updateCommunity({
        communityId: detail._id,
        name,
        description,
        visibility,
        brandColor,
      });
      toast({
        title: "Community settings saved",
        description: "Your community details have been updated.",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-6xl p-3 sm:p-6">
        <Button variant="ghost" asChild className="mb-4 px-0">
          <Link href={detail ? `/communities/${detail.slug}` : "/communities"}>
            <ArrowLeft className="h-4 w-4" />
            Community
          </Link>
        </Button>

        {isPending ? (
          <Card className="p-6 text-muted-foreground">Loading settings...</Card>
        ) : !detail ? (
          <Card className="p-6 text-center text-muted-foreground">
            Community not found.
          </Card>
        ) : !canEdit ? (
          <Card className="p-6 text-center sm:p-10">
            <Settings className="mx-auto h-8 w-8 text-muted-foreground" />
            <h1 className="mt-4 text-2xl font-bold text-foreground">
              Admin access required
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Only owners and admins can manage community settings and invites.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-4xl">
                Community Settings
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Manage visibility, invite links, and member roles for{" "}
                {detail.name}.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="space-y-6">
                <Card className="p-5 sm:p-6">
                  <form onSubmit={handleSave} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <span className="text-sm font-medium text-foreground">
                          Community logo
                        </span>
                        <LogoUploader
                          communityId={detail._id}
                          logoUrl={detail.logoUrl}
                          communityName={detail.name}
                          onUploaded={invalidateCommunity}
                        />
                      </div>
                      <label className="space-y-2 sm:col-span-2">
                        <span className="text-sm font-medium text-foreground">
                          Community name
                        </span>
                        <Input name="name" defaultValue={detail.name} required />
                      </label>
                      <label className="space-y-2 sm:col-span-2">
                        <span className="text-sm font-medium text-foreground">
                          Description
                        </span>
                        <textarea
                          name="description"
                          defaultValue={detail.description ?? ""}
                          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-foreground">
                          Visibility
                        </span>
                        <Select
                          name="visibility"
                          defaultValue={detail.visibility}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select visibility" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="private">
                                Private, discoverable
                              </SelectItem>
                              <SelectItem value="public">Public</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-foreground">
                          Brand color
                        </span>
                        <BrandColorInput
                          key={`${detail._id}:${detail.brandColor ?? ""}`}
                          defaultColor={detail.brandColor}
                        />
                      </label>
                    </div>
                    {error && (
                      <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  </form>
                </Card>

                <Card className="p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">
                      Members
                    </h2>
                  </div>
                  <div className="mt-4 divide-y divide-border">
                    {((memberQuery.data as Member[] | undefined) ?? []).map((member) => (
                      <div
                        key={member._id}
                        className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {member.name || member.email || "Book-Trackr member"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.email || member.clerkId}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {detail.viewerRole === "owner" && member.role !== "owner" ? (
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                updateMemberRole({
                                  memberId: member._id,
                                  role: value as Role,
                                })
                              }
                            >
                              <SelectTrigger className="h-9 w-36 capitalize">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="moderator">
                                    Moderator
                                  </SelectItem>
                                  <SelectItem value="member">Member</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="rounded-md border border-border px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
                              {member.role}
                            </span>
                          )}
                          {member.role !== "owner" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setMemberToRemove(member)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>

              <aside className="space-y-6">
                <Card className="p-5">
                  <div className="flex items-start gap-2">
                    <BookOpen className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        Community books
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Add shared page-based or chapter-based reading plans for
                        members.
                      </p>
                      <Button asChild className="mt-4 w-full">
                        <Link href={`/communities/${detail.slug}/books/new`}>
                          Add community book
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">
                      Invite links
                    </h2>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create invite links for specific roles. You can limit how
                    long each link works and how many people can use it.
                  </p>
                  <form
                    className="mt-4 space-y-3"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!detail || isCreatingInvite) return;
                      setIsCreatingInvite(true);
                      try {
                        await createInvite({
                          communityId: detail._id,
                          roleToGrant,
                          expiresInDays:
                            expirationMode === "limited"
                              ? Number(expiresInDays) || undefined
                              : undefined,
                          maxUses:
                            usageMode === "limited"
                              ? Number(maxUses) || undefined
                              : undefined,
                        });
                        toast({
                          title: "Invite link created",
                          description: "The invite is ready to copy and share.",
                        });
                      } finally {
                        setIsCreatingInvite(false);
                      }
                    }}
                  >
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-foreground">
                        Invite role
                      </span>
                      <Select
                        value={roleToGrant}
                        onValueChange={(value) =>
                          setRoleToGrant(value as typeof roleToGrant)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="moderator">Moderator</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-foreground">
                          Expiry
                        </span>
                        <Select
                          value={expirationMode}
                          onValueChange={(value) =>
                            setExpirationMode(value as typeof expirationMode)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="limited">
                                Expires after days
                              </SelectItem>
                              <SelectItem value="unlimited">
                                Never expires
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <Input
                          value={expiresInDays}
                          onChange={(event) => setExpiresInDays(event.target.value)}
                          type="number"
                          min={1}
                          disabled={expirationMode === "unlimited"}
                        />
                        <span className="block text-xs leading-relaxed text-muted-foreground">
                          {expirationMode === "unlimited"
                            ? "This link will not expire by date."
                            : "Number of days before the link stops working."}
                        </span>
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-foreground">
                          Uses
                        </span>
                        <Select
                          value={usageMode}
                          onValueChange={(value) =>
                            setUsageMode(value as typeof usageMode)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="limited">
                                Limited uses
                              </SelectItem>
                              <SelectItem value="unlimited">
                                Unlimited uses
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <Input
                          value={maxUses}
                          onChange={(event) => setMaxUses(event.target.value)}
                          type="number"
                          min={1}
                          disabled={usageMode === "unlimited"}
                        />
                        <span className="block text-xs leading-relaxed text-muted-foreground">
                          {usageMode === "unlimited"
                            ? "Any number of people can use this link."
                            : "Number of people who can join with this link."}
                        </span>
                      </label>
                    </div>
                    <Button type="submit" disabled={isCreatingInvite} className="w-full">
                      {isCreatingInvite ? "Creating..." : "Create invite"}
                    </Button>
                  </form>
                </Card>

                <Card className="p-5">
                  <h2 className="text-lg font-semibold text-foreground">
                    Active invites
                  </h2>
                  <div className="mt-4 space-y-3">
                    {activeInvites.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No invite links yet.
                      </p>
                    ) : (
                      activeInvites.map((invite) => {
                        const inviteUrl = buildInviteUrl(invite.token);
                        const { inactive, isExpired, isRevoked, isUsedUp } =
                          getInviteState(invite);
                        return (
                          <div key={invite._id} className="rounded-md border border-border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium capitalize text-foreground">
                                {invite.roleToGrant}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {isRevoked
                                  ? "Revoked"
                                  : isExpired
                                    ? "Expired"
                                    : isUsedUp
                                      ? "Used up"
                                      : "Active"}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-2">
                                {invite.expiresAt === undefined ? (
                                  <Infinity className="h-3.5 w-3.5" />
                                ) : (
                                  <CalendarClock className="h-3.5 w-3.5" />
                                )}
                                {getInviteExpiryText(invite)}
                              </span>
                              <span className="inline-flex items-center gap-2">
                                <Users className="h-3.5 w-3.5" />
                                {getInviteUsageText(invite)}
                              </span>
                            </div>
                            <p className="mt-2 truncate text-xs text-muted-foreground">
                              {inviteUrl}
                            </p>
                            <div className="mt-3 flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={inactive}
                                onClick={async () => {
                                  await navigator.clipboard.writeText(inviteUrl);
                                  setCopiedToken(invite.token);
                                }}
                              >
                                <Copy className="h-4 w-4" />
                                {copiedToken === invite.token ? "Copied" : "Copy"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={inactive}
                                onClick={() => setInviteToRevoke(invite)}
                              >
                                <Trash2 className="h-4 w-4" />
                                {inactive ? "Revoked" : "Revoke link"}
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Private communities stay discoverable, but activity and
                      membership are protected by invite-only access.
                    </p>
                  </div>
                </Card>
              </aside>
            </div>
          </div>
        )}
      </main>
      <Dialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              {memberToRemove
                ? `This will remove ${memberToRemove.name || memberToRemove.email || "this member"} from the community. They will need a new invite to join again.`
                : "This member will need a new invite to join again."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeMemberPending}
              onClick={async () => {
                if (!memberToRemove || removeMemberPending) return;
                await removeMember({ memberId: memberToRemove._id });
                toast({
                  title: "Member removed",
                  description: "The member no longer has access to this community.",
                });
                setMemberToRemove(null);
              }}
            >
              {removeMemberPending ? "Removing..." : "Remove member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={inviteToRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setInviteToRevoke(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke invite link?</DialogTitle>
            <DialogDescription>
              This invite link will stop working immediately. It will remain in
              the invite history so you can still see that it was issued.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteToRevoke(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disableInvitePending}
              onClick={async () => {
                if (!inviteToRevoke || disableInvitePending) return;
                await disableInvite({ inviteId: inviteToRevoke._id });
                toast({
                  title: "Invite link revoked",
                  description: "The link can no longer be used to join.",
                });
                setInviteToRevoke(null);
              }}
            >
              {disableInvitePending ? "Revoking..." : "Revoke link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
