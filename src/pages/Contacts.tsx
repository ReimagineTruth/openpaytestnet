import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { Search, UserPlus, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Contact {
  id: string;
  contact_id: string;
  full_name: string;
  username: string | null;
  avatar_url?: string | null;
}

const Contacts = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const navigate = useNavigate();

  const loadContacts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/signin"); return; }

    const { data } = await supabase
      .from("contacts")
      .select("id, contact_id")
      .eq("user_id", user.id);

    if (data) {
      const enriched = await Promise.all(data.map(async (c) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, username, avatar_url")
          .eq("id", c.contact_id)
          .single();
        return {
          ...c,
          full_name: profile?.full_name || "Unknown",
          username: profile?.username || null,
          avatar_url: profile?.avatar_url || null,
        };
      }));
      setContacts(enriched);
    }
  };

  useEffect(() => { loadContacts(); }, []);

  const handleAddContact = async () => {
    if (!addEmail.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Find user by email - search profiles with username or look up by matching
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, username");

    // We need to find by email through auth, but since we can't query auth from client,
    // let's search by username
    const found = profiles?.find(p => p.username === addEmail.trim() || p.full_name === addEmail.trim());
    if (!found) {
      toast.error("User not found. Try their username.");
      return;
    }
    if (found.id === user.id) {
      toast.error("Cannot add yourself");
      return;
    }

    const { error } = await supabase
      .from("contacts")
      .insert({ user_id: user.id, contact_id: found.id });

    if (error) {
      if (error.code === "23505") toast.error("Already in contacts");
      else toast.error(error.message);
    } else {
      toast.success("Contact added!");
      setShowAdd(false);
      setAddEmail("");
      loadContacts();
    }
  };

  const filtered = contacts.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.username && c.username.toLowerCase().includes(search.toLowerCase()))
  );

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").slice(0, 3).toUpperCase();
  };

  const colors = ["bg-paypal-dark", "bg-paypal-light-blue", "bg-primary", "bg-muted-foreground"];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="paypal-heading">Contacts</h1>
          <button onClick={() => setShowAdd(true)} className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full">
            <UserPlus className="w-5 h-5 text-paypal-light-blue" />
          </button>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Name, username, email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 rounded-2xl border-white/70 bg-white pl-10"
            />
          </div>
        </div>

        <div className="paypal-surface overflow-hidden rounded-2xl">
          {filtered.map((contact, i) => (
            <button
              key={contact.id}
              onClick={() => setSelectedContact(contact)}
              className="flex w-full items-center gap-3 border-b border-border/70 px-3 py-4 text-left transition hover:bg-secondary/50 last:border-b-0"
            >
              {contact.avatar_url ? (
                <img src={contact.avatar_url} alt={contact.full_name} className="h-12 w-12 rounded-full border border-border object-cover" />
              ) : (
                <div className={`w-12 h-12 rounded-full ${colors[i % colors.length]} flex items-center justify-center`}>
                  <span className="text-sm font-bold text-primary-foreground">{getInitials(contact.full_name)}</span>
                </div>
              )}
              <div className="text-left">
                <p className="font-semibold text-foreground">{contact.full_name}</p>
                {contact.username && <p className="text-sm text-muted-foreground">@{contact.username}</p>}
              </div>
              <Info className="w-5 h-5 text-muted-foreground ml-auto" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No contacts yet</p>
          )}
        </div>
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="rounded-3xl">
          <DialogTitle className="text-xl font-bold mb-1">Add Contact</DialogTitle>
          <DialogDescription className="mb-4 text-sm text-muted-foreground">
            Add a contact by username.
          </DialogDescription>
          <Input
            placeholder="Enter username"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            className="mb-4 h-12 rounded-2xl border-white/70 bg-white"
          />
          <Button onClick={handleAddContact} className="h-12 w-full rounded-2xl bg-paypal-blue font-semibold text-white hover:bg-[#004dc5]">Add</Button>
        </DialogContent>
      </Dialog>

      {/* Contact Detail Sheet */}
      <Dialog open={!!selectedContact} onOpenChange={() => setSelectedContact(null)}>
        <DialogContent className="rounded-3xl">
          <DialogTitle className="sr-only">Contact details</DialogTitle>
          <DialogDescription className="sr-only">View contact details and start a payment.</DialogDescription>
          {selectedContact && (
            <div className="text-center">
              {selectedContact.avatar_url ? (
                <img src={selectedContact.avatar_url} alt={selectedContact.full_name} className="mx-auto mb-3 h-16 w-16 rounded-full border border-border object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-paypal-dark mx-auto flex items-center justify-center mb-3">
                  <span className="text-lg font-bold text-primary-foreground">{getInitials(selectedContact.full_name)}</span>
                </div>
              )}
              <h3 className="text-xl font-bold">{selectedContact.full_name}</h3>
              {selectedContact.username && <p className="text-muted-foreground">@{selectedContact.username}</p>}
              <Button
                onClick={() => { setSelectedContact(null); navigate(`/send?to=${selectedContact.contact_id}`); }}
                className="mt-6 h-12 w-full rounded-2xl bg-paypal-blue font-semibold text-white hover:bg-[#004dc5]"
              >
                Express Send
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BottomNav active="contacts" />
    </div>
  );
};

export default Contacts;
