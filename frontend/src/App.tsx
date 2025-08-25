import { useState, useEffect } from 'react';
import './App.css';
import { Container, Grid, Card, CardMedia, Typography, TextField, Button, Box, Rating } from '@mui/material';
import StarBorderIcon from '@mui/icons-material/StarBorder';

function App() {
  const [images, setImages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchImages = (query = '') => {
    const url = `http://localhost:8000/api/images${query ? `?query=${query}` : ''}`;
    console.log(`Fetching images from: ${url}`);
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        setImages(data.images);
        console.log("Images from API:", data.images);
      })
      .catch(error => {
        console.error("Failed to fetch images:", error);
      });
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const handleSearch = () => {
    fetchImages(searchQuery);
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
        </Box>
      </Box>

      {images.length > 0 ? (
        <Grid container spacing={2}>
          {images.map((image) => (
            <Grid item key={image.id}>
              <Card sx={{ width: 200, position: 'relative' }}>
                <CardMedia
                  component="img"
                  image={`http://localhost:8000/images/${image.image_path}`}
                  alt={image.filename}
                  sx={{ width: 200, objectFit: 'contain' }}
                />

                <Box sx={{ 
                  position: 'absolute', 
                  bottom: 0, 
                  right: 0, 
                  // 背景色の領域を星のサイズに合わせる
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderRadius: '4px 0 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Rating
                    name={`rating-${image.id}`}
                    value={image.rating}
                    precision={0.5}
                    readOnly
                    emptyIcon={<StarBorderIcon fontSize="inherit" style={{ color: 'white' }} />}
                    sx={{ p: 0.5 }} // Ratingコンポーネント自体にパディングを追加
                  />
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Typography variant="body1" sx={{ mt: 4 }}>
          No images found.
        </Typography>
      )}
    </Container>
  );
}

export default App;