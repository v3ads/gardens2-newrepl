
import { useState } from 'react';
import { Upload, FileArchive, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  const { toast } = useToast();

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    validateAndSetFile(droppedFile);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (file: File) => {
    const validExtensions = ['.tar', '.tar.gz', '.tgz', '.tar.bz2'];
    const isValid = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!isValid) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a .tar, .tar.gz, .tgz, or .tar.bz2 file',
        variant: 'destructive',
      });
      return;
    }

    setFile(file);
    setUploadComplete(false);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        setUploading(false);
        if (xhr.status === 200) {
          setUploadComplete(true);
          toast({
            title: 'Backup restored successfully',
            description: 'Your project files have been replaced. Reloading page...',
          });
          // Reload immediately after showing the message
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          const response = xhr.responseText;
          let errorMessage = 'Upload failed';
          try {
            const json = JSON.parse(response);
            errorMessage = json.error || json.message || errorMessage;
          } catch (e) {
            // Response wasn't JSON
          }
          toast({
            title: 'Upload failed',
            description: errorMessage,
            variant: 'destructive',
          });
        }
      });

      xhr.addEventListener('error', () => {
        toast({
          title: 'Upload failed',
          description: 'An error occurred while uploading the file',
          variant: 'destructive',
        });
        setUploading(false);
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Backup Restoration</h1>
          <p className="text-muted-foreground mt-2">
            Upload a tar backup file to restore and replace your entire project structure
          </p>
        </div>

        <Card
          className="border-2 border-dashed p-12 transition-all hover:border-primary/50"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center justify-center space-y-4">
            {uploadComplete ? (
              <CheckCircle className="h-16 w-16 text-green-500" />
            ) : (
              <Upload className="h-16 w-16 text-muted-foreground" />
            )}
            
            <div className="text-center">
              <p className="text-lg font-medium">
                {uploadComplete
                  ? 'Backup Restored'
                  : 'Drag and drop your backup file'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Supported formats: .tar, .tar.gz, .tgz, .tar.bz2
              </p>
            </div>

            {!uploadComplete && (
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  id="file-input"
                  className="hidden"
                  accept=".tar,.tar.gz,.tgz,.tar.bz2"
                  onChange={handleFileInput}
                />
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('file-input')?.click()}
                >
                  Browse Files
                </Button>
              </div>
            )}
          </div>
        </Card>

        {file && (
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <FileArchive className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                {uploadComplete && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
              </div>

              {uploading && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">
                    {Math.round(progress)}%
                  </p>
                </div>
              )}

              {!uploadComplete && (
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full"
                >
                  {uploading ? 'Uploading...' : 'Upload File'}
                </Button>
              )}

              {uploadComplete && (
                <Button
                  onClick={() => {
                    setFile(null);
                    setUploadComplete(false);
                    setProgress(0);
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Upload Another File
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
