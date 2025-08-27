import { useState, useEffect } from 'react';
import './App.css';
import { 
  Container, Grid, Card, CardMedia, Typography, TextField, Button, Box, Rating, CircularProgress, Alert,
  Dialog, DialogContent, IconButton, Snackbar, Pagination
} from '@mui/material';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import SyncIcon from '@mui/icons-material/Sync';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

const API_URL = "http://localhost:8000/api";

// 画像データ型定義 (簡略化)
interface ImageMetaData {
  id: number;
  filename: string;
  image_path: string;
  prompt: string;
  negative_prompt: string;
  parameters: string;
  rating: number;
}

// APIレスポンスの型を定義
interface ImagesResponse {
    images: ImageMetaData[];
    total_count: number;
}

function App() {
  const [images, setImages] = useState<ImageMetaData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // モーダル表示状態
  const [openModal, setOpenModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageMetaData | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // ページネーションの状態管理
  const [currentPage, setCurrentPage] = useState(1);
  const [totalImages, setTotalImages] = useState(0);
  const imagesPerPage = 20;

  const fetchImages = async (query = '', page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) {
        params.append('query', query);
      }
      params.append('page', String(page));
      params.append('limit', String(imagesPerPage));
      
      const url = `${API_URL}/images?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data: ImagesResponse = await response.json();
      
      setImages(data.images);
      setTotalImages(data.total_count);
      setCurrentPage(page);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 削除されていた関数を再追加
  const fetchImageDetail = async (imageId: number) => {
    try {
      const url = `${API_URL}/images/${imageId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch image detail');
      }
      const data: ImageMetaData = await response.json();
      return data;
    } catch (err: any) {
      console.error("Failed to fetch image detail:", err);
      setError("Failed to load image details.");
      return null;
    }
  };

  useEffect(() => {
    fetchImages('', 1);
  }, []);

  const handleSearch = () => {
    fetchImages(searchQuery, 1);
  };

  const handleRatingChange = async (imageId: number, newRating: number | null) => {
    if (newRating === null) return;
    
    try {
      const response = await fetch(`${API_URL}/images/${imageId}/rate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating: newRating }),
      });
      if (!response.ok) {
        throw new Error('Rating update failed');
      }
      setImages(prevImages =>
        prevImages.map(img =>
          (img.id === imageId ? { ...img, rating: newRating } : img)
        )
      );
    } catch (err: any) {
      console.error('Failed to update rating:', err);
      setError('Failed to update rating. Please try again.');
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/images/sync`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to sync images');
      }
      const data = await response.json();
      await fetchImages(searchQuery, 1);
      setSnackbarMessage(data.message);
      setSnackbarOpen(true);
    } catch (err: any) {
      console.error('Failed to sync images:', err);
      setError('Failed to sync images. Check server logs for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = async (image: ImageMetaData) => {
    const detail = await fetchImageDetail(image.id);
    if (detail) {
      setSelectedImage(detail);
      setOpenModal(true);
    }
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setSelectedImage(null);
  };

  const handleCopyMetaData = (metaData: string) => {
    navigator.clipboard.writeText(metaData)
      .then(() => {
        setSnackbarMessage('メタデータをコピーしました！');
        setSnackbarOpen(true);
      })
      .catch((err) => {
        console.error('Failed to copy meta data:', err);
        setSnackbarMessage('コピーに失敗しました。');
        setSnackbarOpen(true);
      });
  };

  const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
    fetchImages(searchQuery, value);
  };

  const totalPages = Math.ceil(totalImages / imagesPerPage);

  const renderMetaData = (image: ImageMetaData | null) => {
    if (!image) return null;

    const metaDataText = image.parameters || '';

    return (
      <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">生成パラメータ</Typography>
          <IconButton size="small" onClick={() => handleCopyMetaData(metaDataText)}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {metaDataText}
        </Typography>
      </Box>
    );
  };

  return (
    <Container sx={{ pt: 4, pb: 4 }}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h2" component="h1" gutterBottom>
          AI Image Manager
        </Typography>

        <Box sx={{ display: 'flex', mb: 4, gap: 2 }}>
          <TextField
            label="Search images..."
            variant="outlined"
            fullWidth
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            variant="contained"
            size="large"
            onClick={handleSearch}
          >
            Search
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={handleSync}
            disabled={loading}
            startIcon={<SyncIcon />}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Sync Images'}
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && images.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
      ) : images.length > 0 ? (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Pagination count={totalPages} page={currentPage} onChange={handlePageChange} />
          </Box>
          
          <Grid container spacing={2}>
            {images.map((image: any) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={image.id}>
                <Card sx={{ position: 'relative', cursor: 'pointer' }} onClick={() => handleOpenModal(image)}>
                  <CardMedia
                    component="img"
                    image={`http://localhost:8000/images/${image.image_path}`}
                    alt={image.filename}
                    sx={{ height: 250, objectFit: 'contain' }}
                  />
  
                  <Box sx={{ 
                    position: 'absolute', 
                    bottom: 0, 
                    right: 0, 
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    borderRadius: '4px 0 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 0.5 
                  }}>
                    <Rating
                      name={`rating-${image.id}`}
                      value={image.rating || 0}
                      precision={1}
                      onChange={(event, newRating) => {
                        event.stopPropagation();
                        handleRatingChange(image.id, newRating);
                      }}
                      emptyIcon={<StarBorderIcon fontSize="inherit" style={{ color: 'white' }} />}
                      sx={{ p: 0 }}
                    />
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>
          
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination count={totalPages} page={currentPage} onChange={handlePageChange} />
          </Box>
        </>
      ) : (
        <Typography variant="body1" sx={{ mt: 4, textAlign: 'center' }}>
          No images found. Try syncing images.
        </Typography>
      )}

      <Dialog open={openModal} onClose={handleCloseModal} maxWidth="md" fullWidth>
        <IconButton
          aria-label="close"
          onClick={handleCloseModal}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
            zIndex: 1,
          }}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent dividers>
          {selectedImage && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <img 
                src={`http://localhost:8000/images/${selectedImage.image_path}`} 
                alt={selectedImage.filename} 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  marginBottom: '16px'
                }} 
              />
              {renderMetaData(selectedImage)}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      />
    </Container>
  );
}

export default App;