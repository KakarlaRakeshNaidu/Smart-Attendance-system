# Flask API for Face Recognition with MongoDB Integration
from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
import os
from datetime import datetime
from pymongo import MongoClient

# Load .env from parent directory (server/.env)
try:
    from dotenv import load_dotenv
    import pathlib
    env_path = pathlib.Path(__file__).parent.parent / '.env'
    load_dotenv(dotenv_path=env_path)
except ImportError:
    pass  # python-dotenv not installed, rely on shell environment

from models.insightface_model import load_model

app = Flask(__name__)
CORS(app)

# MongoDB Connection — supports both MONGODB_URI (Node.js convention) and MONGO_URI
MONGO_URI = (
    os.environ.get('MONGODB_URI') or
    os.environ.get('MONGO_URI') or
    'mongodb://localhost:27017/attendance_system'
)
client = MongoClient(MONGO_URI)
db = client.get_default_database() if 'attendance_system' in MONGO_URI else client['attendance_system']
students_collection = db['students']

# Load model once at startup
print("Loading InsightFace model...")
model = load_model()
print("Model loaded successfully!")

THRESHOLD = 0.5

def cosine_similarity(a, b):
    """Calculate cosine similarity between two vectors"""
    a = np.array(a)
    b = np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

def decode_base64_image(base64_string):
    """Convert base64 string to OpenCV image"""
    try:
        if not base64_string:
            print("Error: Empty base64 string")
            return None
            
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Clean up the base64 string (remove whitespace)
        base64_string = base64_string.strip().replace('\n', '').replace('\r', '').replace(' ', '')
        
        # Add padding if needed
        padding = 4 - len(base64_string) % 4
        if padding != 4:
            base64_string += '=' * padding
        
        img_data = base64.b64decode(base64_string)
        
        if len(img_data) == 0:
            print("Error: Decoded image data is empty")
            return None
            
        nparr = np.frombuffer(img_data, np.uint8)
        
        if nparr.size == 0:
            print("Error: NumPy array is empty")
            return None
            
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            print("Error: cv2.imdecode returned None")
            return None
            
        return img
    except Exception as e:
        print(f"Error decoding image: {str(e)}")
        return None

def get_all_students_with_embeddings():
    """Get all students who have face embeddings registered"""
    # Fetch all students and filter in Python (simpler and more reliable)
    students = students_collection.find({}, {"studentId": 1, "name": 1, "faceEmbedding": 1})
    
    result = {}
    for student in students:
        embedding = student.get('faceEmbedding')
        if embedding and isinstance(embedding, list) and len(embedding) > 0:
            result[student['studentId']] = {
                "name": student['name'],
                "embedding": np.array(embedding)
            }
    print(f"[DEBUG] Found {len(result)} students with face embeddings")
    return result

@app.route('/api/health', methods=['GET'])
def health_check():
    """Lightweight health check - just confirms Flask + model are running"""
    return jsonify({
        "success": True, 
        "message": "Face recognition API is running",
        "model": "loaded"
    })

@app.route('/api/health/full', methods=['GET'])
def health_check_full():
    """Full health check including MongoDB connection"""
    try:
        client.admin.command('ping')
        students_with_embeddings = get_all_students_with_embeddings()
        student_count = len(students_with_embeddings)
        return jsonify({
            "success": True, 
            "message": "Face recognition API is running",
            "database": "MongoDB connected",
            "registeredFaces": student_count
        })
    except Exception as e:
        return jsonify({
            "success": False, 
            "message": f"API running but database error: {str(e)}"
        }), 500

@app.route('/api/add-student', methods=['POST'])
def add_student():
    """Add face embedding to existing student in MongoDB"""
    try:
        data = request.json
        student_id = data.get('studentId')
        name = data.get('name')
        image_base64 = data.get('image')
        
        if not student_id or not image_base64:
            return jsonify({
                "success": False, 
                "message": "Missing required fields: studentId, image"
            }), 400
        
        # Decode image
        img = decode_base64_image(image_base64)
        if img is None:
            return jsonify({
                "success": False, 
                "message": "Invalid image data"
            }), 400
        
        # Detect faces
        faces = model.get(img)
        
        if len(faces) == 0:
            return jsonify({
                "success": False, 
                "message": "No face detected in the image"
            }), 400
        
        if len(faces) > 1:
            return jsonify({
                "success": False, 
                "message": "Multiple faces detected. Please provide an image with a single face."
            }), 400
        
        # Get embedding
        embedding = faces[0].embedding.tolist()
        
        # Update student in MongoDB with face embedding
        result = students_collection.update_one(
            {"studentId": student_id},
            {"$set": {"faceEmbedding": embedding, "updatedAt": datetime.utcnow()}}
        )
        
        if result.matched_count == 0:
            return jsonify({
                "success": False, 
                "message": "Student not found in database"
            }), 404
        
        return jsonify({
            "success": True,
            "message": "Face registered successfully",
            "embedding": embedding
        })
        
    except Exception as e:
        print(f"Error adding student: {str(e)}")
        return jsonify({
            "success": False, 
            "message": str(e)
        }), 500

@app.route('/api/remove-student', methods=['POST'])
def remove_student():
    """Remove face embedding from a student in MongoDB"""
    try:
        data = request.json
        student_id = data.get('studentId')
        
        if not student_id:
            return jsonify({
                "success": False, 
                "message": "Missing studentId"
            }), 400
        
        # Remove face embedding from student
        result = students_collection.update_one(
            {"studentId": student_id},
            {"$set": {"faceEmbedding": [], "updatedAt": datetime.utcnow()}}
        )
        
        if result.matched_count == 0:
            return jsonify({
                "success": False,
                "message": "Student not found"
            }), 404
        
        return jsonify({
            "success": True,
            "message": f"Face data removed for student {student_id}"
        })
            
    except Exception as e:
        return jsonify({
            "success": False, 
            "message": str(e)
        }), 500

@app.route('/api/recognize', methods=['POST'])
def recognize_face():
    """Recognize face and return matched student"""
    try:
        data = request.json
        image_base64 = data.get('image')
        
        if not image_base64:
            return jsonify({
                "success": False, 
                "message": "Missing image"
            }), 400
        
        # Decode image
        img = decode_base64_image(image_base64)
        if img is None:
            return jsonify({
                "success": False, 
                "message": "Invalid image data"
            }), 400
        
        # Load students with embeddings from MongoDB
        students_db = get_all_students_with_embeddings()
        
        if len(students_db) == 0:
            return jsonify({
                "success": False, 
                "message": "No students with registered faces"
            }), 400
        
        # Detect faces
        faces = model.get(img)
        print(f"[DEBUG] Detected {len(faces)} faces")
        
        if len(faces) == 0:
            return jsonify({
                "success": False, 
                "message": "No face detected"
            }), 400
        
        # ===== VECTORIZED COMPARISON =====
        # Pre-build arrays for batch processing
        student_ids = list(students_db.keys())
        student_names = [students_db[sid]["name"] for sid in student_ids]
        
        # Stack all registered embeddings: Shape (num_students, 512)
        registered_embeddings = np.vstack([students_db[sid]["embedding"] for sid in student_ids])
        registered_norms = np.linalg.norm(registered_embeddings, axis=1, keepdims=True)
        registered_normalized = registered_embeddings / registered_norms
        
        recognized_students = []
        
        for face in faces:
            # Normalize face embedding
            face_emb = face.embedding.reshape(1, -1)
            face_norm = np.linalg.norm(face_emb)
            face_normalized = face_emb / face_norm
            
            # Compute all similarities at once via matrix multiplication
            similarities = np.dot(face_normalized, registered_normalized.T).flatten()
            
            best_idx = np.argmax(similarities)
            best_score = similarities[best_idx]
            best_match = student_ids[best_idx]
            
            print(f"[DEBUG] Best match: {best_match} with score {best_score:.4f} (threshold={THRESHOLD})")
            
            if best_score > THRESHOLD:
                recognized_students.append({
                    "studentId": best_match,
                    "name": student_names[best_idx],
                    "confidence": float(best_score)
                })
        
        if len(recognized_students) == 0:
            return jsonify({
                "success": False, 
                "message": "Face not recognized"
            }), 400
        
        return jsonify({
            "success": True,
            "message": "Face(s) recognized",
            "students": recognized_students
        })
        
    except Exception as e:
        print(f"Error in recognize: {str(e)}")
        return jsonify({
            "success": False, 
            "message": str(e)
        }), 500

@app.route('/api/recognize-multiple', methods=['POST'])
def recognize_multiple_faces():
    """Recognize multiple faces from a single image for classroom attendance"""
    try:
        data = request.json
        image_base64 = data.get('image')
        
        if not image_base64:
            return jsonify({
                "success": False, 
                "message": "Missing image"
            }), 400
        
        # Decode image
        img = decode_base64_image(image_base64)
        if img is None:
            return jsonify({
                "success": False, 
                "message": "Invalid image data"
            }), 400
        
        # Load students with embeddings from MongoDB
        students_db = get_all_students_with_embeddings()
        
        if len(students_db) == 0:
            return jsonify({
                "success": False, 
                "message": "No students with registered faces"
            }), 400
        
        # Detect all faces
        faces = model.get(img)
        
        if len(faces) == 0:
            return jsonify({
                "success": False,
                "message": "No faces detected in the image"
            }), 400
        
        # ===== VECTORIZED PARALLEL COMPARISON =====
        # Pre-build arrays for batch processing (much faster than nested loops)
        student_ids = list(students_db.keys())
        student_names = [students_db[sid]["name"] for sid in student_ids]
        
        # Stack all registered embeddings into a matrix: Shape (num_students, 512)
        registered_embeddings = np.vstack([students_db[sid]["embedding"] for sid in student_ids])
        # Normalize registered embeddings once (for cosine similarity)
        registered_norms = np.linalg.norm(registered_embeddings, axis=1, keepdims=True)
        registered_normalized = registered_embeddings / registered_norms
        
        # Stack all detected face embeddings into a matrix: Shape (num_faces, 512)
        face_embeddings = np.vstack([face.embedding for face in faces])
        # Normalize face embeddings
        face_norms = np.linalg.norm(face_embeddings, axis=1, keepdims=True)
        face_normalized = face_embeddings / face_norms
        
        # Compute ALL similarities in one matrix multiplication: Shape (num_faces, num_students)
        # This is the parallel operation - all comparisons happen simultaneously via BLAS
        similarity_matrix = np.dot(face_normalized, registered_normalized.T)
        
        # Find best match for each face (vectorized)
        best_indices = np.argmax(similarity_matrix, axis=1)  # Shape: (num_faces,)
        best_scores = np.max(similarity_matrix, axis=1)       # Shape: (num_faces,)
        
        # Build results
        recognized = []
        unrecognized_count = 0
        
        for i, (best_idx, score) in enumerate(zip(best_indices, best_scores)):
            if score > THRESHOLD:
                recognized.append({
                    "studentId": student_ids[best_idx],
                    "name": student_names[best_idx],
                    "confidence": float(score)
                })
            else:
                unrecognized_count += 1
        
        # Remove duplicates (same student detected multiple times) - keep highest confidence
        seen = {}
        for student in recognized:
            sid = student["studentId"]
            if sid not in seen or student["confidence"] > seen[sid]["confidence"]:
                seen[sid] = student
        unique_recognized = list(seen.values())
        
        return jsonify({
            "success": True,
            "message": f"Detected {len(faces)} faces, recognized {len(unique_recognized)} students",
            "totalFaces": len(faces),
            "recognizedStudents": unique_recognized,
            "unrecognizedCount": unrecognized_count
        })
        
    except Exception as e:
        return jsonify({
            "success": False, 
            "message": str(e)
        }), 500

@app.route('/api/get-embedding', methods=['POST'])
def get_embedding():
    """Get face embedding from an image without saving"""
    try:
        data = request.json
        image_base64 = data.get('image')
        
        if not image_base64:
            return jsonify({
                "success": False, 
                "message": "Missing image"
            }), 400
        
        # Decode image
        img = decode_base64_image(image_base64)
        if img is None:
            return jsonify({
                "success": False, 
                "message": "Invalid image data"
            }), 400
        
        # Detect faces
        faces = model.get(img)
        
        if len(faces) == 0:
            return jsonify({
                "success": False, 
                "message": "No face detected"
            }), 400
        
        if len(faces) > 1:
            return jsonify({
                "success": False, 
                "message": "Multiple faces detected"
            }), 400
        
        embedding = faces[0].embedding.tolist()
        
        return jsonify({
            "success": True,
            "message": "Face embedding extracted",
            "embedding": embedding
        })
        
    except Exception as e:
        return jsonify({
            "success": False, 
            "message": str(e)
        }), 500

@app.route('/api/registered-count', methods=['GET'])
def get_registered_count():
    """Get count of students with registered face embeddings"""
    try:
        count = students_collection.count_documents({"faceEmbedding": {"$exists": True, "$ne": []}})
        return jsonify({
            "success": True,
            "count": count
        })
    except Exception as e:
        return jsonify({
            "success": False, 
            "message": str(e)
        }), 500

if __name__ == '__main__':
    print(f"Connecting to MongoDB: {MONGO_URI}")
    print("Starting Face Recognition API on port 5001...")
    app.run(host='0.0.0.0', port=5001, debug=False)
