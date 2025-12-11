import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, ZoomIn, ZoomOut, FileText, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface DocumentViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
  fileName: string;
}

export function DocumentViewer({ open, onOpenChange, filePath, fileName }: DocumentViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
  const isPdf = /\.pdf$/i.test(fileName);

  const loadFile = async () => {
    if (!filePath || filePath.trim() === "") {
      setError("Documento sem arquivo");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get signed URL for private files
      const { data, error: urlError } = await supabase.storage
        .from("employee-documents")
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (urlError) throw urlError;
      
      setFileUrl(data.signedUrl);
    } catch (err: any) {
      console.error("Error loading file:", err);
      setError("Erro ao carregar documento");
      toast.error("Erro ao carregar documento");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const { data, error } = await supabase.storage
        .from("employee-documents")
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "documento";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Download iniciado");
    } catch (error: any) {
      toast.error("Erro ao baixar documento");
      console.error(error);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      loadFile();
    } else {
      setFileUrl(null);
      setZoom(100);
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 truncate pr-4">
              <FileText className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="truncate">{fileName}</span>
            </DialogTitle>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isImage && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setZoom(Math.max(50, zoom - 25))}
                    disabled={zoom <= 50}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground min-w-[3rem] text-center">
                    {zoom}%
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setZoom(Math.min(200, zoom + 25))}
                    disabled={zoom >= 200}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button variant="outline" size="icon" onClick={handleDownload}>
                <Download className="w-4 h-4" />
              </Button>
              {fileUrl && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(fileUrl, '_blank')}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0 bg-muted/30 rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
              <FileText className="w-16 h-16 text-muted-foreground" />
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Tentar Download
              </Button>
            </div>
          ) : fileUrl ? (
            isImage ? (
              <div className="flex items-center justify-center p-4 min-h-96">
                <img
                  src={fileUrl}
                  alt={fileName}
                  className="max-w-full h-auto rounded-lg shadow-lg transition-transform"
                  style={{ transform: `scale(${zoom / 100})` }}
                  onError={() => setError("Erro ao carregar imagem")}
                />
              </div>
            ) : isPdf ? (
              <iframe
                src={fileUrl}
                className="w-full h-[70vh] rounded-lg"
                title={fileName}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-96 gap-4">
                <FileText className="w-16 h-16 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Visualização não disponível para este tipo de arquivo
                </p>
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Arquivo
                </Button>
              </div>
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
