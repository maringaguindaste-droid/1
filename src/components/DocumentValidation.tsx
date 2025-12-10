import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle } from "lucide-react";

interface DocumentValidationProps {
  documentId: string;
  onValidate: (status: "approved" | "rejected", reason?: string) => Promise<void>;
}

export function DocumentValidation({ documentId, onValidate }: DocumentValidationProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [validationType, setValidationType] = useState<"approved" | "rejected">("approved");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOpenDialog = (type: "approved" | "rejected") => {
    setValidationType(type);
    setShowDialog(true);
    setReason("");
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onValidate(validationType, reason);
      setShowDialog(false);
      setReason("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          onClick={() => handleOpenDialog("approved")}
          className="bg-green-600 hover:bg-green-700"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          Aprovar
        </Button>
        <Button
          onClick={() => handleOpenDialog("rejected")}
          variant="destructive"
        >
          <XCircle className="w-4 h-4 mr-2" />
          Rejeitar
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {validationType === "approved" ? "Aprovar Documento" : "Rejeitar Documento"}
            </DialogTitle>
            <DialogDescription>
              {validationType === "approved"
                ? "Você está prestes a aprovar este documento. Deseja adicionar alguma observação?"
                : "Por favor, informe o motivo da rejeição para que o funcionário possa corrigir e reenviar o documento."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="reason">
                {validationType === "approved" ? "Observações (opcional)" : "Motivo da Rejeição"}
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  validationType === "approved"
                    ? "Digite observações sobre a validação..."
                    : "Digite o motivo da rejeição..."
                }
                className="mt-2"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={loading || (validationType === "rejected" && !reason.trim())}
              className={validationType === "approved" ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {loading ? "Processando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}