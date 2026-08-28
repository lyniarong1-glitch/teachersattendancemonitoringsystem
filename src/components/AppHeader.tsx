import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { History, Home, LogOut, Menu, Trash2, UserRound } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import dccSeal from "@/assets/dcc-seal.jpg.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { AccountDialog } from "@/components/AccountDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function AppHeader({ name, role, userId, isSA = false }: { name: string; role: string; userId?: string | undefined; isSA?: boolean | undefined }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  async function signOut() { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); void navigate({ to: "/", replace: true }); }
  const removeAccount = useMutation({
    mutationFn: () => deleteMyAccount(),
    onSuccess: async () => { await supabase.auth.signOut(); queryClient.clear(); toast.success("Your account has been deleted"); void navigate({ to: "/", replace: true }); },
    onError: (error: Error) => toast.error(error.message),
  });
  return <>
    <header className="no-print border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex min-h-16 max-w-[95rem] items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <img src={dccSeal.url} alt="Davao Central College seal" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          <span className="break-words font-serif text-sm font-bold uppercase leading-tight sm:text-lg">Teachers Attendance Monitoring System</span>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button variant="ghost" className="h-auto max-w-28 px-2 py-1 text-right text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground sm:max-w-56" onClick={() => setProfileOpen(true)}><span className="min-w-0"><span className="block truncate font-bold underline underline-offset-2">{name}</span><span className="block truncate text-xs opacity-75">{role}</span></span></Button>
          <Sheet><SheetTrigger asChild><Button size="icon" variant="secondary" aria-label="Open navigation menu"><Menu className="h-5 w-5" /></Button></SheetTrigger><SheetContent className="flex flex-col"><SheetHeader><SheetTitle>Account Menu</SheetTitle><SheetDescription>{name} · {role}</SheetDescription></SheetHeader><nav className="mt-6 grid gap-2"><SheetClose asChild><Button variant="ghost" className="justify-start" onClick={() => void navigate({ to: isSA ? "/sa" : "/hr" })}><Home className="mr-3 h-4 w-4" />Dashboard</Button></SheetClose><SheetClose asChild><Button variant="ghost" className="justify-start" onClick={() => setProfileOpen(true)}><UserRound className="mr-3 h-4 w-4" />My Profile</Button></SheetClose>{isSA && <SheetClose asChild><Button variant="ghost" className="justify-start" onClick={() => void navigate({ to: "/sa-history" })}><History className="mr-3 h-4 w-4" />My Recent History</Button></SheetClose>}</nav><div className="mt-auto grid gap-2 border-t pt-4"><Button variant="outline" className="justify-start" onClick={() => void signOut()}><LogOut className="mr-3 h-4 w-4" />Sign Out</Button>{isSA && <Button variant="destructive" className="justify-start" onClick={() => setDeleteOpen(true)}><Trash2 className="mr-3 h-4 w-4" />Delete Account</Button>}</div></SheetContent></Sheet>
        </div>
      </div>
    </header>
    <AccountDialog open={profileOpen} onOpenChange={setProfileOpen} userId={userId} isSA={isSA} />
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete your account?</AlertDialogTitle><AlertDialogDescription>This permanently removes your access. Submitted attendance records remain available to HR for official records.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={removeAccount.isPending} onClick={() => removeAccount.mutate()}>{removeAccount.isPending ? "Deleting…" : "Delete Account"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}