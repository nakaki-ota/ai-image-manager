import { useState, useEffect } from 'react';
import './App.css';
import { Container, Grid, Card, CardMedia, Typography, TextField, Button, Box, Rating, CircularProgress, Alert } from '@mui/material';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import SyncIcon from '@mui/icons-material/Sync';

const API_URL = "http://localhost:8000/api";

function App() {
  const [images, setImages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchImages = async (query = '') => {
    setLoading(true);
    setError(null);
    try {
      const url = `${API_URL}/images${query ? `?query=${query}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      setImages(data.images);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const handleSearch = () => {
    fetchImages(searchQuery);
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
          (img as any).id === imageId ? { ...img, rating: newRating } : img
        )
      );
    } catch (err) {
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
      await fetchImages();
      alert(data.message);
    } catch (err) {
      console.error('Failed to sync images:', err);
      setError('Failed to sync images. Check server logs for details.');
    } finally {
      setLoading(false);
    }
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
        <Grid container spacing={2}>
          {images.map((image: any) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={image.id}>
              <Card sx={{ position: 'relative' }}>
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
      ) : (
        <Typography variant="body1" sx={{ mt: 4, textAlign: 'center' }}>
          No images found. Try syncing images.
        </Typography>
      )}
    </Container>
  );
}

export default App;