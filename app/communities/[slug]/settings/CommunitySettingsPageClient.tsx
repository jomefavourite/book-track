"use client";

import { FormEvent, ReactNode, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Check,
  Copy,
  ImagePlus,
  Infinity,
  LinkIcon,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserMinus,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { trackActionFailed, trackEvent } from "@/lib/analytics";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormPageSkeleton } from "@/components/CommunityCardSkeleton";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import DayLabelsSettings from "@/components/DayLabelsSettings";

type Role = "owner" | "admin" | "moderator" | "member";

type CommunityDetail = {
  _id: Id<"communities">;
  name: string;
  slug: string;
  description?: string;
  visibility: "public" | "private";
  brandColor?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  websiteUrl?: string;
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

function memberDisplayName(member: Member) {
  return member.name || member.email || "BookTrackr member";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

function CommunityAvatar({
  name,
  logoUrl,
  brandColor,
}: {
  name: string;
  logoUrl?: string | null;
  brandColor?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white"
      style={{ backgroundColor: safeBrandColor(brandColor ?? "") }}
    >
      {initials(name)}
    </span>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 className="font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

/** One titled group inside the General form. Title sits beside the fields on wide screens. */
function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 p-5 sm:p-6 xl:grid-cols-[14rem_minmax(0,1fr)] xl:gap-8">
      <SectionHeading title={title} description={description} />
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs font-medium capitalize text-muted-foreground">
      {role}
    </span>
  );
}

function InviteRow({
  invite,
  copied = false,
  onCopy,
  onRevoke,
}: {
  invite: Invite;
  copied?: boolean;
  onCopy?: () => void;
  onRevoke?: () => void;
}) {
  const inviteUrl = buildInviteUrl(invite.token);
  const { inactive, isExpired, isRevoked, isUsedUp } = getInviteState(invite);
  const status = isRevoked
    ? "Revoked"
    : isExpired
      ? "Expired"
      : isUsedUp
        ? "Used up"
        : "Active";

  return (
    <div
      className={`rounded-lg border border-border p-3 sm:p-4 ${inactive ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <RoleBadge role={invite.roleToGrant} />
        <span
          className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-medium ${
            inactive
              ? "bg-muted text-muted-foreground"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {status}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {invite.expiresAt === undefined ? (
            <Infinity className="h-3.5 w-3.5" />
          ) : (
            <CalendarClock className="h-3.5 w-3.5" />
          )}
          {getInviteExpiryText(invite)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {getInviteUsageText(invite)}
        </span>
      </div>
      {!inactive && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {inviteUrl}
          </code>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={onCopy}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 text-muted-foreground hover:text-destructive sm:flex-none"
              onClick={onRevoke}
            >
              <Trash2 className="h-4 w-4" />
              Revoke
            </Button>
          </div>
        </div>
      )}
    </div>
  );
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
      trackEvent("community_image_uploaded", { kind: "logo" });
      onUploaded();
      toast({
        title: "Logo updated",
        description: "Your community logo has been saved.",
      });
    } catch (error) {
      trackActionFailed("image_upload", error);
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("general");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleToGrant, setRoleToGrant] = useState<"admin" | "moderator" | "member">("member");
  const [expirationMode, setExpirationMode] = useState<"limited" | "unlimited">("limited");
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [usageMode, setUsageMode] = useState<"limited" | "unlimited">("limited");
  const [maxUses, setMaxUses] = useState("1");
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<Invite | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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

  const { mutateAsync: deleteCommunity, isPending: deleteCommunityPending } =
    useMutation({
      mutationFn: useConvexMutation(api.communities.deleteCommunity),
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
    const instagramUrl = String(formData.get("instagramUrl") ?? "");
    const tiktokUrl = String(formData.get("tiktokUrl") ?? "");
    const websiteUrl = String(formData.get("websiteUrl") ?? "");
    try {
      await updateCommunity({
        communityId: detail._id,
        name,
        description,
        visibility,
        brandColor,
        instagramUrl,
        tiktokUrl,
        websiteUrl,
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

  const isOwner = detail?.viewerRole === "owner";
  const deleteConfirmed =
    deleteConfirmText.trim().toLowerCase() ===
    (detail?.name ?? "").trim().toLowerCase();

  const closeDeleteDialog = () => {
    setShowDeleteDialog(false);
    setDeleteConfirmText("");
  };

  const handleDeleteCommunity = async () => {
    if (!detail || !deleteConfirmed || deleteCommunityPending) return;
    try {
      await deleteCommunity({ communityId: detail._id });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.discoverCommunities, {}).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.getMyCommunities, {}).queryKey,
      });
      toast({
        title: "Community deleted",
        description: `${detail.name} and all of its activity have been removed.`,
      });
      router.push("/communities");
    } catch (caught) {
      toast({
        title: "Could not delete community",
        description:
          caught instanceof Error ? caught.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const members = (memberQuery.data as Member[] | undefined) ?? [];
  const liveInvites = activeInvites.filter(
    (invite) => !getInviteState(invite).inactive
  );
  const pastInvites = activeInvites.filter(
    (invite) => getInviteState(invite).inactive
  );

  const handleRoleChange = async (member: Member, role: Role) => {
    try {
      await updateMemberRole({ memberId: member._id, role });
      toast({
        title: "Role updated",
        description: `${memberDisplayName(member)} is now ${role === "admin" ? "an" : "a"} ${role}.`,
      });
    } catch (caught) {
      toast({
        title: "Could not update role",
        description: caught instanceof Error ? caught.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateInvite = async (event: FormEvent) => {
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
          usageMode === "limited" ? Number(maxUses) || undefined : undefined,
      });
      trackEvent("invite_created", {
        role: roleToGrant,
        expires_in_days:
          expirationMode === "limited" ? Number(expiresInDays) || null : null,
        max_uses: usageMode === "limited" ? Number(maxUses) || null : null,
      });
      toast({
        title: "Invite link created",
        description: "The invite is ready to copy and share.",
      });
    } catch (caught) {
      toast({
        title: "Could not create invite",
        description: caught instanceof Error ? caught.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const copyInvite = async (invite: Invite) => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(invite.token));
      setCopiedToken(invite.token);
      setTimeout(
        () => setCopiedToken((current) => (current === invite.token ? null : current)),
        2000
      );
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  const tabs = [
    { value: "general", label: "General", icon: Settings },
    {
      value: "members",
      label: "Members",
      icon: Users,
      count: memberQuery.data ? members.length : undefined,
    },
    {
      value: "invites",
      label: "Invites",
      icon: LinkIcon,
      count: inviteQuery.data ? liveInvites.length : undefined,
    },
    { value: "day-labels", label: "Day labels", icon: CalendarDays },
    ...(isOwner
      ? [{ value: "danger", label: "Danger zone", icon: TriangleAlert }]
      : []),
  ];

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-6xl p-3 pb-12 sm:p-6 sm:pb-16">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-4 max-w-full">
          <Link href={detail ? `/communities/${detail.slug}` : "/communities"}>
            <ArrowLeft className="h-4 w-4" />
            <span className="truncate">
              {detail ? `Back to ${detail.name}` : "Communities"}
            </span>
          </Link>
        </Button>

        {isPending ? (
          <FormPageSkeleton fields={5} />
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
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <CommunityAvatar
                  name={detail.name}
                  logoUrl={detail.logoUrl}
                  brandColor={detail.brandColor}
                />
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                    Settings
                  </h1>
                  <p className="truncate text-sm text-muted-foreground">
                    {detail.name}
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href={`/communities/${detail.slug}/books/new`}>
                  <BookOpen className="h-4 w-4" />
                  Add community book
                </Link>
              </Button>
            </header>

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8"
            >
              <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg p-1 [scrollbar-width:none] lg:sticky lg:top-6 lg:flex-col lg:items-stretch lg:overflow-visible lg:bg-transparent lg:p-0 [&::-webkit-scrollbar]:hidden">
                {tabs.map(({ value, label, icon: Icon, count }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className={`shrink-0 gap-2 px-3 py-2 lg:justify-start lg:hover:bg-muted/60 lg:data-[state=active]:bg-muted lg:data-[state=active]:shadow-none ${
                      value === "danger" ? "text-destructive data-[state=active]:text-destructive" : ""
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                    {count !== undefined && (
                      <span className="ml-auto rounded-full bg-background px-1.5 text-xs tabular-nums text-muted-foreground lg:bg-transparent">
                        {count}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Kept mounted so unsaved edits survive switching tabs. */}
              <TabsContent
                value="general"
                forceMount
                className="mt-4 data-[state=inactive]:hidden lg:mt-0"
              >
                <Card className="overflow-hidden">
                  <form onSubmit={handleSave}>
                    <div className="divide-y divide-border">
                      <FormSection
                        title="Profile"
                        description="How your community appears to members and visitors."
                      >
                        <div className="space-y-2">
                          <span className="text-sm font-medium text-foreground">
                            Logo
                          </span>
                          <LogoUploader
                            communityId={detail._id}
                            logoUrl={detail.logoUrl}
                            communityName={detail.name}
                            onUploaded={invalidateCommunity}
                          />
                        </div>
                        <Field label="Community name" htmlFor="community-name">
                          <Input
                            id="community-name"
                            name="name"
                            defaultValue={detail.name}
                            required
                          />
                        </Field>
                        <Field label="Description" htmlFor="community-description">
                          <textarea
                            id="community-description"
                            name="description"
                            defaultValue={detail.description ?? ""}
                            rows={4}
                            placeholder="What does your community read together?"
                            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          />
                        </Field>
                      </FormSection>

                      <FormSection
                        title="Visibility & branding"
                        description="Control who can see activity and set your accent color."
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Visibility">
                            <Select name="visibility" defaultValue={detail.visibility}>
                              <SelectTrigger aria-label="Visibility">
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
                          </Field>
                          <Field label="Brand color">
                            <BrandColorInput
                              key={`${detail._id}:${detail.brandColor ?? ""}`}
                              defaultColor={detail.brandColor}
                            />
                          </Field>
                        </div>
                        <p className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                          Private communities stay discoverable, but activity and
                          membership are protected by invite-only access.
                        </p>
                      </FormSection>

                      <FormSection
                        title="Links"
                        description="Optional links shown on your community page."
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Instagram" htmlFor="community-instagram">
                            <Input
                              id="community-instagram"
                              name="instagramUrl"
                              type="url"
                              defaultValue={detail.instagramUrl ?? ""}
                              placeholder="https://instagram.com/yourcommunity"
                            />
                          </Field>
                          <Field label="TikTok" htmlFor="community-tiktok">
                            <Input
                              id="community-tiktok"
                              name="tiktokUrl"
                              type="url"
                              defaultValue={detail.tiktokUrl ?? ""}
                              placeholder="https://tiktok.com/@yourcommunity"
                            />
                          </Field>
                          <Field
                            label="Website"
                            htmlFor="community-website"
                            className="sm:col-span-2"
                          >
                            <Input
                              id="community-website"
                              name="websiteUrl"
                              type="url"
                              defaultValue={detail.websiteUrl ?? ""}
                              placeholder="https://yourcommunity.com"
                            />
                          </Field>
                        </div>
                      </FormSection>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
                      {error && (
                        <p
                          role="alert"
                          className="text-sm text-destructive sm:mr-auto"
                        >
                          {error}
                        </p>
                      )}
                      <Button
                        type="submit"
                        disabled={isSaving || updatePending}
                        className="w-full sm:w-auto"
                      >
                        {isSaving ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  </form>
                </Card>
              </TabsContent>

              <TabsContent value="members" className="mt-4 lg:mt-0">
                <Card className="p-5 sm:p-6">
                  <SectionHeading
                    title="Members"
                    description={
                      isOwner
                        ? "Change roles or remove people from the community."
                        : "Only the owner can change roles. You can remove members."
                    }
                  />
                  <div className="mt-4 divide-y divide-border">
                    {memberQuery.isPending ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Loading members...
                      </p>
                    ) : members.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No members yet.
                      </p>
                    ) : (
                      members.map((member) => (
                        <div
                          key={member._id}
                          className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span
                              aria-hidden="true"
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
                            >
                              {initials(memberDisplayName(member))}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {memberDisplayName(member)}
                              </p>
                              {member.email && member.name && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {member.email}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pl-12 sm:shrink-0 sm:pl-0">
                            {isOwner && member.role !== "owner" ? (
                              <Select
                                value={member.role}
                                onValueChange={(value) =>
                                  handleRoleChange(member, value as Role)
                                }
                              >
                                <SelectTrigger
                                  className="h-9 flex-1 sm:w-36 sm:flex-none"
                                  aria-label={`Role for ${memberDisplayName(member)}`}
                                >
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
                              <RoleBadge role={member.role} />
                            )}
                            {member.role !== "owner" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => setMemberToRemove(member)}
                                aria-label={`Remove ${memberDisplayName(member)}`}
                              >
                                <UserMinus className="h-4 w-4" />
                                <span className="sm:sr-only">Remove</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="invites" className="mt-4 space-y-6 lg:mt-0">
                <Card className="p-5 sm:p-6">
                  <SectionHeading
                    title="Create an invite link"
                    description="Choose the role new members get, and limit how long the link works or how many people can use it."
                  />
                  <form className="mt-5 space-y-5" onSubmit={handleCreateInvite}>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Role">
                        <Select
                          value={roleToGrant}
                          onValueChange={(value) =>
                            setRoleToGrant(value as typeof roleToGrant)
                          }
                        >
                          <SelectTrigger aria-label="Invite role">
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
                      </Field>
                      <Field label="Expiry">
                        <div className="flex gap-2">
                          <Select
                            value={expirationMode}
                            onValueChange={(value) =>
                              setExpirationMode(value as typeof expirationMode)
                            }
                          >
                            <SelectTrigger aria-label="Invite expiry">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="limited">After days</SelectItem>
                                <SelectItem value="unlimited">Never</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {expirationMode === "limited" && (
                            <Input
                              value={expiresInDays}
                              onChange={(event) => setExpiresInDays(event.target.value)}
                              type="number"
                              min={1}
                              inputMode="numeric"
                              aria-label="Days until the link expires"
                              className="w-20 shrink-0"
                            />
                          )}
                        </div>
                      </Field>
                      <Field label="Uses">
                        <div className="flex gap-2">
                          <Select
                            value={usageMode}
                            onValueChange={(value) =>
                              setUsageMode(value as typeof usageMode)
                            }
                          >
                            <SelectTrigger aria-label="Invite uses">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="limited">Limited</SelectItem>
                                <SelectItem value="unlimited">Unlimited</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {usageMode === "limited" && (
                            <Input
                              value={maxUses}
                              onChange={(event) => setMaxUses(event.target.value)}
                              type="number"
                              min={1}
                              inputMode="numeric"
                              aria-label="Number of people who can use the link"
                              className="w-20 shrink-0"
                            />
                          )}
                        </div>
                      </Field>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {expirationMode === "limited"
                          ? `Expires in ${Number(expiresInDays) || "?"} day${Number(expiresInDays) === 1 ? "" : "s"}`
                          : "Never expires"}
                        {" · "}
                        {usageMode === "limited"
                          ? `${Number(maxUses) || "?"} use${Number(maxUses) === 1 ? "" : "s"}`
                          : "Unlimited uses"}
                      </p>
                      <Button
                        type="submit"
                        disabled={isCreatingInvite || invitePending}
                        className="w-full sm:w-auto"
                      >
                        <Plus className="h-4 w-4" />
                        {isCreatingInvite ? "Creating..." : "Create invite"}
                      </Button>
                    </div>
                  </form>
                </Card>

                <Card className="p-5 sm:p-6">
                  <SectionHeading
                    title="Active links"
                    description="Share these links to let people join."
                  />
                  <div className="mt-4 space-y-3">
                    {liveInvites.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        No active invite links. Create one above.
                      </p>
                    ) : (
                      liveInvites.map((invite) => (
                        <InviteRow
                          key={invite._id}
                          invite={invite}
                          copied={copiedToken === invite.token}
                          onCopy={() => copyInvite(invite)}
                          onRevoke={() => setInviteToRevoke(invite)}
                        />
                      ))
                    )}
                  </div>

                  {pastInvites.length > 0 && (
                    <details className="group mt-6 border-t border-border pt-4">
                      <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">Show</span>
                        <span className="hidden group-open:inline">Hide</span>{" "}
                        past links ({pastInvites.length})
                      </summary>
                      <div className="mt-3 space-y-3">
                        {pastInvites.map((invite) => (
                          <InviteRow key={invite._id} invite={invite} />
                        ))}
                      </div>
                    </details>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="day-labels" className="mt-4 lg:mt-0">
                <DayLabelsSettings communityId={detail._id} canEdit={canEdit} />
              </TabsContent>

              {isOwner && (
                <TabsContent value="danger" className="mt-4 lg:mt-0">
                  <Card className="border-destructive/40 p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="font-semibold text-foreground">
                          Delete this community
                        </h2>
                        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                          Permanently removes its books, schedules, day labels,
                          invites, and every member&apos;s access. This cannot be
                          undone.
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        className="w-full shrink-0 sm:w-auto"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete community
                      </Button>
                    </div>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
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
      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this community?</DialogTitle>
            <DialogDescription>
              This permanently deletes{" "}
              <span className="font-semibold text-foreground">
                {detail?.name}
              </span>
              , including all community books, schedules, day labels, invites,
              and memberships. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label
              htmlFor="delete-confirm"
              className="text-sm text-muted-foreground"
            >
              Type{" "}
              <span className="font-semibold text-foreground">
                {detail?.name}
              </span>{" "}
              to confirm.
            </label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder={detail?.name}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteConfirmed || deleteCommunityPending}
              onClick={handleDeleteCommunity}
            >
              {deleteCommunityPending ? "Deleting..." : "Delete community"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
