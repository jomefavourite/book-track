"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import BookCard from "@/components/BookCard";
import ArchivedBookCard from "@/components/ArchivedBookCard";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import AuthButton from "@/components/AuthButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type TabType = "active" | "archived";

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>("active");

  const { data: books, isPending: booksPending } = useQuery({
    ...convexQuery(api.books.getBooks, { userId: user?.id || "" }),
    enabled: isLoaded && !!user?.id && activeTab === "active",
  });

  const { data: archivedBooks, isPending: archivedPending } = useQuery({
    ...convexQuery(api.books.getArchivedBooks, { userId: user?.id || "" }),
    enabled: isLoaded && !!user?.id && activeTab === "archived",
  });

  const isPending = activeTab === "active" ? booksPending : archivedPending;
  const booksWithProgress =
    activeTab === "active" ? books || [] : archivedBooks || [];

  let content = null;
  if (isPending && books === undefined) {
    content = (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-base text-muted-foreground sm:text-lg">
          Loading books...
        </div>
      </div>
    );
  } else {
    content = (
      <div>
        {booksWithProgress.length === 0 ? (
          <Card className="p-6 text-center sm:p-12">
            <p className="mb-4 text-sm text-muted-foreground sm:text-lg">
              {activeTab === "active"
                ? "No active books yet. Add your first book to get started!"
                : "No archived books yet."}
            </p>
            {activeTab === "active" && (
              <Button asChild>
                <Link href="/books/new">Add Book</Link>
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {booksWithProgress.map((book: any) =>
              activeTab === "archived" ? (
                <ArchivedBookCard
                  key={book._id}
                  book={book}
                  progress={book.progress || 0}
                />
              ) : (
                <BookCard
                  key={book._id}
                  book={book}
                  progress={book.progress || 0}
                />
              )
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start justify-between sm:block">
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-4xl">
              My Books
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:mt-2 sm:text-base">
              Track your reading progress
            </p>
          </div>
          {/* Hamburger menu - mobile only */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="sm:hidden"
                aria-label="Toggle menu"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
            >
              <DropdownMenuLabel>Menu</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    Theme
                  </span>
                  <ThemeSwitcher />
                </div>
              </div>
              <div className="px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    Account
                  </span>
                  <AuthButton />
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Desktop buttons - hidden on mobile */}
        <div className="hidden items-center gap-2 sm:flex sm:gap-4">
          <AuthButton />
          <ThemeSwitcher />
        </div>
      </div>

      <div className="mb-4 flex gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={activeTab}
          onValueChange={(value: string) => setActiveTab(value as TabType)}
          className="w-full"
        >
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger
              value="active"
              className="flex-1 sm:flex-none"
            >
              Active
            </TabsTrigger>
            <TabsTrigger
              value="archived"
              className="flex-1 sm:flex-none"
            >
              Archived
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "active" && (
          <Button asChild>
            <Link href="/books/new">+ Add New Book</Link>
          </Button>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950 sm:mb-6 sm:p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="mb-1 text-xs font-semibold text-blue-900 dark:text-blue-100 sm:text-sm">
              💡 Discover Public Reading Tracker
            </h3>
            <p className="mb-2 text-xs leading-relaxed text-blue-700 dark:text-blue-300 sm:text-sm">
              Want to see how others are tracking their reading? Visit the
              public page to explore all public reading journeys and get
              inspiration for your own reading goals.
            </p>
            <Button
              asChild
              variant="default"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <Link href="/public">View Public Books →</Link>
            </Button>
          </div>
        </div>
      </div>

      {content}
    </div>
  );
}
