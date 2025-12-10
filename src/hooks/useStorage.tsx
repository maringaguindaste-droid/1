import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useStorage = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const uploadFile = async (file: File, path: string) => {
    try {
      setUploading(true);
      setUploadProgress(0);

      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Arquivo muito grande. Tamanho máximo: 10MB");
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'application/zip',
        'application/x-xps'
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error("Tipo de arquivo não permitido. Use: PDF, PNG, JPG, ZIP ou XPS");
      }

      const { data, error } = await supabase.storage
        .from('employee-documents')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      setUploadProgress(100);
      toast({
        title: "Sucesso",
        description: "Arquivo enviado com sucesso!",
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Erro no upload",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const downloadFile = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('employee-documents')
        .download(path);

      if (error) throw error;

      return data;
    } catch (error: any) {
      toast({
        title: "Erro ao baixar",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteFile = async (path: string) => {
    try {
      const { error } = await supabase.storage
        .from('employee-documents')
        .remove([path]);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Arquivo deletado com sucesso!",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao deletar",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage
      .from('employee-documents')
      .getPublicUrl(path);

    return data.publicUrl;
  };

  const getSignedUrl = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('employee-documents')
        .createSignedUrl(path, 3600); // 1 hora de validade

      if (error) throw error;

      return data.signedUrl;
    } catch (error: any) {
      toast({
        title: "Erro ao gerar URL",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    uploadFile,
    downloadFile,
    deleteFile,
    getPublicUrl,
    getSignedUrl,
    uploading,
    uploadProgress,
  };
};
